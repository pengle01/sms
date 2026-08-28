// Notice attachments — validation and naming rules.
//
// Pure logic only (no fs, no Prisma) so it can be shared by the browser (to
// reject a bad file before uploading) and the server (which must re-check,
// because the client-side check is a courtesy, not a control).

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file

/** How many files one notice / announcement / staff message may carry. */
export const ATTACHMENT_MAX_COUNT = 5;

/**
 * Ceiling for a single upload request. Below the 25 MB body limit suggested in
 * ops/caddy/Caddyfile, so a full set never trips the reverse proxy first — a
 * 413 from Caddy is an opaque failure, ours is a translated message.
 */
export const ATTACHMENT_MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB per upload

/**
 * Accepted MIME types mapped to the extension the file gets ON DISK.
 *
 * The stored extension is taken from THIS table, never from the uploaded
 * filename, so "grades.pdf.exe" cannot land on disk as an executable.
 *
 * Deliberately absent: SVG and HTML (both can carry script and would run in
 * the origin if a browser ever rendered them inline), and archives (zip/rar —
 * the school has no use for them and they hide their contents from every
 * check we can make here).
 */
export const ALLOWED_ATTACHMENTS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

/** Every accepted extension, for the file picker's `accept` attribute. */
export const ALLOWED_EXTENSIONS = [...new Set(Object.values(ALLOWED_ATTACHMENTS))];

/** `accept` attribute value: MIME types plus extensions (Safari needs both). */
export const ATTACHMENT_ACCEPT = [
  ...Object.keys(ALLOWED_ATTACHMENTS),
  ...ALLOWED_EXTENSIONS.map((e) => `.${e}`),
].join(",");

/**
 * What an upload is attached to. Stored on StoredFile.category so a file's
 * origin stays visible in the database, and so the download route knows which
 * relations decide visibility.
 */
export const ATTACHMENT_CATEGORIES = ["notice", "announcement", "notification"] as const;
export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number];

export function isAttachmentCategory(value: string): value is AttachmentCategory {
  return (ATTACHMENT_CATEGORIES as readonly string[]).includes(value);
}

export type AttachmentReason = "empty" | "tooLarge" | "type";

/** Failures that only a whole set can have, plus every single-file failure. */
export type AttachmentSetReason = AttachmentReason | "tooMany" | "tooLargeTotal";

export type AttachmentVerdict =
  | { ok: true; ext: string; mimeType: string }
  | { ok: false; reason: AttachmentReason };

/** Lowercase extension without the dot, or "" when the name has none. */
export function fileExtension(name: string): string {
  const base = name.slice(name.lastIndexOf("/") + 1).slice(name.lastIndexOf("\\") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Decide whether an uploaded file is acceptable.
 *
 * `type` is what the browser guessed and is not trustworthy on its own — some
 * systems send "" or application/octet-stream for .docx/.xlsx. When that
 * happens we fall back to the extension, which still has to be in the
 * allowlist, so nothing new gets through.
 */
export function validateAttachment(file: { name: string; type: string; size: number }): AttachmentVerdict {
  if (file.size <= 0) return { ok: false, reason: "empty" };
  if (file.size > ATTACHMENT_MAX_BYTES) return { ok: false, reason: "tooLarge" };

  const declared = file.type.trim().toLowerCase();
  const byMime = ALLOWED_ATTACHMENTS[declared];
  if (byMime) return { ok: true, ext: byMime, mimeType: declared };

  // Unhelpful or absent Content-Type → decide on the extension instead.
  if (!declared || declared === "application/octet-stream") {
    const ext = fileExtension(file.name);
    const entry = Object.entries(ALLOWED_ATTACHMENTS).find(([, e]) => e === ext);
    if (entry) return { ok: true, ext: entry[1], mimeType: entry[0] };
  }

  return { ok: false, reason: "type" };
}

/**
 * The name shown to users and sent back on download. Strips any directory
 * component and control characters — the value is echoed into a
 * Content-Disposition header, so a stray CR/LF would be header injection.
 */
export function sanitizeDisplayName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return clean.slice(0, 200) || "attachment";
}

/** Filenames we generate ourselves: a UUID plus an allowlisted extension. */
export function isSafeStoredName(stored: string): boolean {
  return /^[A-Za-z0-9-]+\.[a-z0-9]+$/.test(stored) && !stored.includes("..");
}

/**
 * Content-Disposition for a download. Greek filenames are the norm here, so the
 * RFC 5987 `filename*` form carries the real name and the plain `filename`
 * stays as an ASCII fallback for anything that cannot read it.
 */
export function attachmentDisposition(filename: string): string {
  const safe = sanitizeDisplayName(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

/** Human-readable size for the UI. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type AttachmentSetVerdict =
  | { ok: true; items: { ext: string; mimeType: string }[] }
  | { ok: false; reason: AttachmentSetReason };

/**
 * Validate a whole selection at once.
 *
 * Checked cheapest-and-most-actionable first: telling someone they picked too
 * many files is more useful than naming the first one that is also too big.
 */
export function validateAttachmentSet(
  files: { name: string; type: string; size: number }[],
): AttachmentSetVerdict {
  if (files.length === 0) return { ok: false, reason: "empty" };
  if (files.length > ATTACHMENT_MAX_COUNT) return { ok: false, reason: "tooMany" };

  const items: { ext: string; mimeType: string }[] = [];
  for (const file of files) {
    const verdict = validateAttachment(file);
    if (!verdict.ok) return verdict;
    items.push({ ext: verdict.ext, mimeType: verdict.mimeType });
  }

  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > ATTACHMENT_MAX_TOTAL_BYTES) return { ok: false, reason: "tooLargeTotal" };

  return { ok: true, items };
}
