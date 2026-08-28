import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isStaff } from "@/lib/rbac";
import { logger, errInfo } from "@/server/logger";
import { removeUpload, saveUpload } from "@/server/uploads";
import {
  ATTACHMENT_MAX_TOTAL_BYTES,
  isAttachmentCategory,
  sanitizeDisplayName,
  validateAttachmentSet,
} from "@/lib/attachments";

// Upload one or more attachments. Returns the StoredFile ids, which the caller
// then passes to notices.create / postAnnouncement / sendStaffNotification.
//
// This is a route handler rather than part of a server action because server
// actions carry a 1 MB body limit, and rather than tRPC because JSON would have
// to base64 the bytes, inflating them by a third.
//
// All-or-nothing: a partial success would leave the caller with ids for some
// files and no way to clean up the rest, so any failure rolls the whole set back.
export async function POST(request: NextRequest) {
  const auth = await getActiveAuth();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!auth.roles.some((r) => isStaff(r))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });

  // What the files will hang off. Anything unrecognised falls back to "notice";
  // the field only labels the rows, it grants nothing.
  const rawCategory = String(form.get("category") ?? "");
  const category = isAttachmentCategory(rawCategory) ? rawCategory : "notice";

  // The client checked this too; that check is a courtesy, this one is the control.
  const verdict = validateAttachmentSet(
    files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
  );
  if (!verdict.ok) {
    const status = verdict.reason === "tooLarge" || verdict.reason === "tooLargeTotal" ? 413 : 400;
    return NextResponse.json({ error: verdict.reason }, { status });
  }

  // Read everything before writing anything, so a short read fails the request
  // rather than half of it. File.size is client-supplied metadata — the cap is
  // enforced again here on what actually arrived.
  const payloads: { storedName: string; displayName: string; mimeType: string; bytes: Uint8Array }[] = [];
  let total = 0;
  for (const [i, file] of files.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) return NextResponse.json({ error: "empty" }, { status: 400 });
    total += bytes.byteLength;
    if (total > ATTACHMENT_MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: "tooLargeTotal" }, { status: 413 });
    }
    // The name on disk is ours: a UUID plus an extension taken from the
    // allowlist, never from the upload. The user's name is kept only as data.
    payloads.push({
      storedName: `${randomUUID()}.${verdict.items[i]!.ext}`,
      displayName: sanitizeDisplayName(file.name),
      mimeType: verdict.items[i]!.mimeType,
      bytes,
    });
  }

  const written: string[] = [];
  const rollback = async () => {
    await Promise.all(written.map((n) => removeUpload(n)));
  };

  try {
    for (const p of payloads) {
      await saveUpload(p.storedName, p.bytes);
      written.push(p.storedName);
    }
  } catch (e) {
    await rollback();
    logger.error({ event: "attachment.writeFailed", category, err: errInfo(e) }, "Could not write attachments");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }

  try {
    // One transaction: either every file is recorded or none is, so no file is
    // ever left on disk with nothing pointing at it.
    const rows = await db.$transaction(
      payloads.map((p) =>
        db.storedFile.create({
          data: {
            filename: p.displayName,
            path: p.storedName,
            mimeType: p.mimeType,
            size: p.bytes.byteLength,
            uploadedById: auth.userId,
            category,
          },
          select: { id: true, filename: true, size: true },
        }),
      ),
    );
    return NextResponse.json({ files: rows });
  } catch (e) {
    await rollback();
    logger.error({ event: "attachment.recordFailed", category, err: errInfo(e) }, "Could not record attachments");
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
