import { describe, it, expect } from "vitest";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MAX_TOTAL_BYTES,
  validateAttachmentSet,
  ALLOWED_ATTACHMENTS,
  ATTACHMENT_ACCEPT,
  attachmentDisposition,
  fileExtension,
  formatBytes,
  isAttachmentCategory,
  ATTACHMENT_CATEGORIES,
  isSafeStoredName,
  sanitizeDisplayName,
  validateAttachment,
} from "@/lib/attachments";

const ok = (name: string, type: string, size = 1000) => validateAttachment({ name, type, size });

describe("fileExtension", () => {
  it("returns the lowercased extension", () => {
    expect(fileExtension("Ανακοίνωση.PDF")).toBe("pdf");
  });

  it("returns the last extension for a double-barrelled name", () => {
    expect(fileExtension("grades.pdf.exe")).toBe("exe");
  });

  it("returns empty string when there is no extension", () => {
    expect(fileExtension("README")).toBe("");
  });

  it("returns empty string for a dotfile with no extension", () => {
    expect(fileExtension(".gitignore")).toBe("");
  });

  it("returns empty string when the name ends in a dot", () => {
    expect(fileExtension("notes.")).toBe("");
  });
});

describe("validateAttachment", () => {
  it("accepts a PDF and reports the stored extension", () => {
    expect(ok("circular.pdf", "application/pdf")).toEqual({
      ok: true,
      ext: "pdf",
      mimeType: "application/pdf",
    });
  });

  it("accepts every allowlisted MIME type", () => {
    for (const [mime, ext] of Object.entries(ALLOWED_ATTACHMENTS)) {
      expect(ok(`file.${ext}`, mime)).toEqual({ ok: true, ext, mimeType: mime });
    }
  });

  it("rejects an empty file", () => {
    expect(ok("empty.pdf", "application/pdf", 0)).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a file over the size cap", () => {
    expect(ok("big.pdf", "application/pdf", ATTACHMENT_MAX_BYTES + 1)).toEqual({
      ok: false,
      reason: "tooLarge",
    });
  });

  it("accepts a file exactly on the size cap", () => {
    expect(ok("exact.pdf", "application/pdf", ATTACHMENT_MAX_BYTES).ok).toBe(true);
  });

  it("rejects SVG — it can carry script", () => {
    expect(ok("logo.svg", "image/svg+xml")).toEqual({ ok: false, reason: "type" });
  });

  it("rejects HTML", () => {
    expect(ok("page.html", "text/html")).toEqual({ ok: false, reason: "type" });
  });

  it("rejects archives", () => {
    expect(ok("bundle.zip", "application/zip")).toEqual({ ok: false, reason: "type" });
  });

  it("falls back to the extension when the browser sends no Content-Type", () => {
    expect(ok("list.xlsx", "")).toEqual({
      ok: true,
      ext: "xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  });

  it("falls back to the extension for a generic octet-stream", () => {
    expect(ok("letter.docx", "application/octet-stream").ok).toBe(true);
  });

  it("still rejects a disallowed extension when the type is generic", () => {
    expect(ok("payload.exe", "application/octet-stream")).toEqual({ ok: false, reason: "type" });
  });

  it("rejects an executable disguised with a document name", () => {
    expect(ok("grades.pdf.exe", "application/x-msdownload")).toEqual({ ok: false, reason: "type" });
  });

  it("ignores case and padding in the declared type", () => {
    expect(ok("scan.jpg", "  IMAGE/JPEG  ").ok).toBe(true);
  });

  it("checks size before type, so a huge disallowed file reports the size", () => {
    expect(ok("huge.zip", "application/zip", ATTACHMENT_MAX_BYTES + 1)).toEqual({
      ok: false,
      reason: "tooLarge",
    });
  });
});

describe("sanitizeDisplayName", () => {
  it("keeps a Greek filename intact", () => {
    expect(sanitizeDisplayName("Ανακοίνωση Εκδρομής.pdf")).toBe("Ανακοίνωση Εκδρομής.pdf");
  });

  it("strips a POSIX directory component", () => {
    expect(sanitizeDisplayName("../../etc/passwd")).toBe("passwd");
  });

  it("strips a Windows directory component", () => {
    expect(sanitizeDisplayName("C:\\Users\\me\\notes.pdf")).toBe("notes.pdf");
  });

  it("removes CR/LF so the name cannot inject a header", () => {
    expect(sanitizeDisplayName("a.pdf\r\nX-Evil: 1")).toBe("a.pdfX-Evil: 1");
  });

  it("falls back to a placeholder when nothing survives", () => {
    expect(sanitizeDisplayName("   ")).toBe("attachment");
  });

  it("caps very long names", () => {
    expect(sanitizeDisplayName("x".repeat(500)).length).toBe(200);
  });
});

describe("isSafeStoredName", () => {
  it("accepts a generated uuid name", () => {
    expect(isSafeStoredName("3f2504e0-4f89-11d3-9a0c-0305e82c3301.pdf")).toBe(true);
  });

  it("rejects a traversal attempt", () => {
    expect(isSafeStoredName("../secrets.pdf")).toBe(false);
  });

  it("rejects a nested path", () => {
    expect(isSafeStoredName("sub/dir.pdf")).toBe(false);
  });

  it("rejects a name with no extension", () => {
    expect(isSafeStoredName("abcdef")).toBe(false);
  });
});

describe("attachmentDisposition", () => {
  it("always marks the response as an attachment", () => {
    expect(attachmentDisposition("a.pdf")).toMatch(/^attachment;/);
  });

  it("percent-encodes a Greek name in the RFC 5987 field", () => {
    const header = attachmentDisposition("Έγγραφο.pdf");
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent("Έγγραφο.pdf"));
  });

  it("leaves an ASCII-only fallback for the plain filename field", () => {
    const ascii = /filename="([^"]*)"/.exec(attachmentDisposition("Έγγραφο.pdf"))?.[1] ?? "";
    expect(ascii).toMatch(/^[\x20-\x7e]*$/);
  });

  it("neutralises quotes that would break out of the filename field", () => {
    expect(attachmentDisposition('a".pdf')).not.toContain('a".pdf');
  });
});

describe("formatBytes", () => {
  it("reports small files in bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("reports kilobytes", () => {
    expect(formatBytes(2048)).toBe("2 KB");
  });

  it("reports megabytes to one decimal", () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("handles zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });
});

describe("isAttachmentCategory", () => {
  it("accepts every declared category", () => {
    for (const c of ATTACHMENT_CATEGORIES) {
      expect(isAttachmentCategory(c)).toBe(true);
    }
  });

  it("covers every surface that can carry an attachment", () => {
    expect(ATTACHMENT_CATEGORIES).toContain("notice");
    expect(ATTACHMENT_CATEGORIES).toContain("announcement");
    expect(ATTACHMENT_CATEGORIES).toContain("notification");
  });

  it("rejects an unknown category", () => {
    expect(isAttachmentCategory("referral")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isAttachmentCategory("")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isAttachmentCategory("Notice")).toBe(false);
  });

  it("rejects a prototype property name", () => {
    expect(isAttachmentCategory("constructor")).toBe(false);
  });
});

describe("ATTACHMENT_ACCEPT", () => {
  it("offers both MIME types and extensions to the file picker", () => {
    expect(ATTACHMENT_ACCEPT).toContain("application/pdf");
    expect(ATTACHMENT_ACCEPT).toContain(".pdf");
  });

  it("never offers a scriptable type", () => {
    expect(ATTACHMENT_ACCEPT).not.toContain("svg");
    expect(ATTACHMENT_ACCEPT).not.toContain("html");
  });
});

describe("validateAttachmentSet", () => {
  const pdf = (name: string, size = 1000) => ({ name, type: "application/pdf", size });
  const many = (n: number, size = 1000) =>
    Array.from({ length: n }, (_, i) => pdf(`f${i}.pdf`, size));

  it("accepts a single file", () => {
    const v = validateAttachmentSet([pdf("a.pdf")]);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.items).toHaveLength(1);
  });

  it("accepts a full set and reports one item per file, in order", () => {
    const v = validateAttachmentSet([
      pdf("a.pdf"),
      { name: "b.png", type: "image/png", size: 10 },
    ]);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.items.map((i) => i.ext)).toEqual(["pdf", "png"]);
  });

  it("accepts exactly the maximum count", () => {
    expect(validateAttachmentSet(many(ATTACHMENT_MAX_COUNT)).ok).toBe(true);
  });

  it("rejects one file over the maximum count", () => {
    expect(validateAttachmentSet(many(ATTACHMENT_MAX_COUNT + 1))).toEqual({
      ok: false,
      reason: "tooMany",
    });
  });

  it("rejects an empty selection", () => {
    expect(validateAttachmentSet([])).toEqual({ ok: false, reason: "empty" });
  });

  it("reports the count problem before a per-file problem", () => {
    const set = [...many(ATTACHMENT_MAX_COUNT), { name: "x.zip", type: "application/zip", size: 1 }];
    expect(validateAttachmentSet(set)).toEqual({ ok: false, reason: "tooMany" });
  });

  it("rejects the set when any single file is disallowed", () => {
    expect(
      validateAttachmentSet([pdf("a.pdf"), { name: "x.svg", type: "image/svg+xml", size: 10 }]),
    ).toEqual({ ok: false, reason: "type" });
  });

  it("rejects the set when any single file is over the per-file cap", () => {
    expect(validateAttachmentSet([pdf("a.pdf"), pdf("big.pdf", ATTACHMENT_MAX_BYTES + 1)])).toEqual({
      ok: false,
      reason: "tooLarge",
    });
  });

  it("rejects a set whose combined size exceeds the request cap", () => {
    // Three files, each individually legal, that together are not.
    const size = ATTACHMENT_MAX_BYTES;
    expect(validateAttachmentSet(many(3, size))).toEqual({ ok: false, reason: "tooLargeTotal" });
  });

  it("accepts a set sitting exactly on the combined cap", () => {
    const size = ATTACHMENT_MAX_TOTAL_BYTES / 2;
    expect(validateAttachmentSet(many(2, size)).ok).toBe(true);
  });

  it("keeps the combined cap at or below the per-file cap times the count", () => {
    expect(ATTACHMENT_MAX_TOTAL_BYTES).toBeLessThanOrEqual(
      ATTACHMENT_MAX_BYTES * ATTACHMENT_MAX_COUNT,
    );
  });
});
