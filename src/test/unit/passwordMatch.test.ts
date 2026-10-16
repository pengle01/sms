import { describe, it, expect } from "vitest";
import { confirmState } from "@/lib/passwordMatch";

describe("confirmState", () => {
  it("is empty while the confirm field is empty", () => {
    expect(confirmState("secret123", "")).toBe("empty");
    expect(confirmState("", "")).toBe("empty");
  });

  it("matches identical passwords", () => {
    expect(confirmState("Κωδικός-2026", "Κωδικός-2026")).toBe("match");
  });

  it("does not match different passwords", () => {
    expect(confirmState("secret123", "secret124")).toBe("mismatch");
  });

  it("compares exactly, without trimming or case folding", () => {
    expect(confirmState("Secret123", "secret123")).toBe("mismatch");
    expect(confirmState("secret123", "secret123 ")).toBe("mismatch");
  });
});
