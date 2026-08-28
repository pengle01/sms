import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// uploadsDir() reads UPLOADS_DIR at call time, so pointing it at a scratch
// directory per test keeps this off the real uploads folder.
const dirs: string[] = [];

async function useScratchDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "sms-uploads-"));
  dirs.push(dir);
  process.env.UPLOADS_DIR = dir;
  return dir;
}

afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

let scratch: string;
beforeEach(async () => {
  scratch = await useScratchDir();
});

const { saveUpload, readUpload, removeUpload, uploadsDir } = await import("@/server/uploads");

const NAME = "3f2504e0-4f89-11d3-9a0c-0305e82c3301.pdf";

describe("uploadsDir", () => {
  it("resolves UPLOADS_DIR to an absolute path", () => {
    expect(path.isAbsolute(uploadsDir())).toBe(true);
  });

  it("falls back to <cwd>/uploads when UPLOADS_DIR is unset", () => {
    const saved = process.env.UPLOADS_DIR;
    delete process.env.UPLOADS_DIR;
    expect(uploadsDir()).toBe(path.join(process.cwd(), "uploads"));
    process.env.UPLOADS_DIR = saved;
  });

  it("falls back when UPLOADS_DIR is blank", () => {
    process.env.UPLOADS_DIR = "   ";
    expect(uploadsDir()).toBe(path.join(process.cwd(), "uploads"));
  });
});

describe("saveUpload / readUpload", () => {
  it("round-trips the exact bytes", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
    await saveUpload(NAME, bytes);
    expect(new Uint8Array(await readUpload(NAME))).toEqual(bytes);
  });

  it("creates the uploads directory on demand", async () => {
    process.env.UPLOADS_DIR = path.join(scratch, "nested", "deeper");
    await saveUpload(NAME, new Uint8Array([1]));
    expect((await stat(path.join(scratch, "nested", "deeper", NAME))).isFile()).toBe(true);
  });

  it("writes the file inside the uploads directory under its stored name", async () => {
    await saveUpload(NAME, new Uint8Array([1, 2, 3]));
    expect(await readFile(path.join(scratch, NAME))).toHaveLength(3);
  });

  it("does not make the file world-readable", async () => {
    await saveUpload(NAME, new Uint8Array([1]));
    const mode = (await stat(path.join(scratch, NAME))).mode & 0o777;
    expect(mode & 0o007).toBe(0);
  });
});

describe("path traversal guards", () => {
  const evil = [
    "../escape.pdf",
    "../../etc/passwd",
    "sub/dir.pdf",
    "sub\\dir.pdf",
    "/etc/passwd",
    "noextension",
    "..",
  ];

  for (const name of evil) {
    it(`refuses to write "${name}"`, async () => {
      await expect(saveUpload(name, new Uint8Array([1]))).rejects.toThrow();
    });

    it(`refuses to read "${name}"`, async () => {
      await expect(readUpload(name)).rejects.toThrow();
    });
  }
});

describe("removeUpload", () => {
  it("deletes a stored file", async () => {
    await saveUpload(NAME, new Uint8Array([1]));
    await removeUpload(NAME);
    await expect(readUpload(NAME)).rejects.toThrow();
  });

  it("is silent when the file is already gone", async () => {
    await expect(removeUpload(NAME)).resolves.toBeUndefined();
  });

  it("still refuses an unsafe name", async () => {
    await expect(removeUpload("../gone.pdf")).rejects.toThrow();
  });
});
