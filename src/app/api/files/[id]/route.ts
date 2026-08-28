import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isStaff } from "@/lib/rbac";
import { logger, errInfo } from "@/server/logger";
import { readUpload } from "@/server/uploads";
import { attachmentDisposition } from "@/lib/attachments";

// Download a stored file.
//
// Files are NOT served from /public — every request is authorised here, because
// an attachment on a staff-only notice must stay staff-only. A guessed id gets
// 404 rather than 403 so the endpoint never confirms that a file exists.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const auth = await getActiveAuth();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const file = await db.storedFile.findUnique({
    where: { id },
    select: {
      filename: true,
      path: true,
      mimeType: true,
      uploadedById: true,
      notices: { select: { staffOnly: true } },
      announcements: { select: { id: true } },
      notifications: { select: { userId: true, senderId: true } },
    },
  });
  if (!file) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const staff = auth.roles.some((r) => isStaff(r));
  // A notice's attachment inherits that notice's audience; an announcement is
  // staff-internal (management posts it, educators see it on their dashboard).
  // A file attached to nothing is still reachable by whoever uploaded it.
  const viaNotice = file.notices.some((n) => staff || !n.staffOnly);
  const viaAnnouncement = file.announcements.length > 0 && staff;
  // A staff message is addressed: only the people it was sent to, plus whoever
  // sent it, may open what it carried.
  const viaNotification = file.notifications.some(
    (n) => n.userId === auth.userId || n.senderId === auth.userId,
  );
  const visible =
    file.uploadedById === auth.userId || viaNotice || viaAnnouncement || viaNotification;
  if (!visible) return NextResponse.json({ error: "notFound" }, { status: 404 });

  let data: Buffer;
  try {
    data = await readUpload(file.path);
  } catch (e) {
    // Row present, bytes gone — a restored database without its uploads
    // directory looks exactly like this, so log it as an error worth chasing.
    logger.error(
      { event: "file.readFailed", fileId: id, err: errInfo(e) },
      "Stored file is recorded but missing on disk",
    );
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(data.byteLength),
      // Always a download, never rendered in our origin.
      "Content-Disposition": attachmentDisposition(file.filename),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
