import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSafeStoredName } from "@/lib/attachments";

// On-disk storage for uploaded files.
//
// UPLOADS_DIR is the deployment's persistent, writable directory — it is listed
// in ReadWritePaths in ops/systemd/sms.service and must be backed up (see
// docs/DEPLOY.md). In dev it falls back to <project>/uploads.
export function uploadsDir(): string {
  const configured = process.env.UPLOADS_DIR?.trim();
  return configured && configured.length > 0
    ? path.resolve(configured)
    : path.join(process.cwd(), "uploads");
}

/**
 * Absolute path of a stored file, refusing anything that is not one of the
 * names we generate. Two independent guards: the name must match the
 * UUID.ext shape, and the resolved path must still be inside the uploads
 * directory. Either one alone stops traversal; both cost nothing.
 */
function resolveStored(storedName: string): string {
  if (!isSafeStoredName(storedName)) {
    throw new Error("Unsafe stored filename");
  }
  const dir = uploadsDir();
  const full = path.resolve(dir, storedName);
  if (full !== path.join(dir, storedName)) {
    throw new Error("Stored filename escapes the uploads directory");
  }
  return full;
}

export async function saveUpload(storedName: string, data: Uint8Array): Promise<void> {
  const full = resolveStored(storedName);
  await mkdir(uploadsDir(), { recursive: true });
  // 0640: readable by the service user and its group, never world-readable —
  // these files can carry student-identifying content.
  await writeFile(full, data, { mode: 0o640 });
}

export async function readUpload(storedName: string): Promise<Buffer> {
  return readFile(resolveStored(storedName));
}

export async function removeUpload(storedName: string): Promise<void> {
  await unlink(resolveStored(storedName)).catch(() => {});
}
