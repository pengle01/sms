import { describe, it, expect } from "vitest";
import { passwordsMatch, registerValues } from "@/lib/registerForm";

describe("sign-up form", () => {
  it("flags a mismatch only once the confirmation is typed", () => {
    expect(passwordsMatch("secret123", "")).toBe(true);
    expect(passwordsMatch("secret123", "secret123")).toBe(true);
    expect(passwordsMatch("secret123", "secret12")).toBe(false);
  });

  it("gives back what was typed, never the passwords", () => {
    const fd = new FormData();
    fd.set("firstName", " Μαρία ");
    fd.set("lastName", "Παπαδοπούλου");
    fd.set("email", "m@example.com");
    fd.set("role", "TEACHER");
    fd.set("staffName", "ΠΑΠΑΔΟΠΟΥΛΟΥ Μ.");
    fd.set("password", "secret123");
    fd.set("confirmPassword", "secret124");
    const v = registerValues(fd);
    expect(v).toEqual({
      firstName: "Μαρία",
      lastName: "Παπαδοπούλου",
      email: "m@example.com",
      role: "TEACHER",
      staffName: "ΠΑΠΑΔΟΠΟΥΛΟΥ Μ.",
    });
    expect(JSON.stringify(v)).not.toContain("secret");
  });

  it("returns empty strings for missing fields", () => {
    expect(registerValues(new FormData())).toEqual({ firstName: "", lastName: "", email: "", role: "", staffName: "" });
  });
});
