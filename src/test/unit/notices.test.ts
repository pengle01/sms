import { describe, it, expect } from "vitest";
import { canDeleteNotice } from "@/lib/rbac";

const AUTHOR = "u_author";

describe("canDeleteNotice", () => {
  it("lets the author remove their own notice", () => {
    expect(canDeleteNotice(["SCHOOL_ADMIN"], AUTHOR, AUTHOR)).toBe(true);
  });

  it("does not let one staff member remove another's", () => {
    // A notice is school-wide; withdrawing someone else's is not theirs to do.
    expect(canDeleteNotice(["SCHOOL_ADMIN"], AUTHOR, "u_other")).toBe(false);
    expect(canDeleteNotice(["HEADMASTER"], AUTHOR, "u_other")).toBe(false);
  });

  it("lets the system admin remove anyone's", () => {
    expect(canDeleteNotice(["SUPER_ADMIN"], AUTHOR, "u_other")).toBe(true);
  });

  it("counts an admin grant held alongside another role", () => {
    expect(canDeleteNotice(["TEACHER", "SUPER_ADMIN"], AUTHOR, "u_other")).toBe(true);
  });

  it("refuses when there is no viewer", () => {
    expect(canDeleteNotice(["SUPER_ADMIN"], AUTHOR, null)).toBe(false);
    expect(canDeleteNotice(["SUPER_ADMIN"], AUTHOR, undefined)).toBe(false);
    expect(canDeleteNotice(["SUPER_ADMIN"], AUTHOR, "")).toBe(false);
  });
});
