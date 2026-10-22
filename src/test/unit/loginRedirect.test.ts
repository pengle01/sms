import { describe, it, expect } from "vitest";
import { loginPathFor, loginPathForPortal } from "@/lib/loginRedirect";
import { redirectTo, publicOrigin } from "@/lib/redirect";

describe("loginPathFor", () => {
  it("sends parents and students to their own login pages", () => {
    expect(loginPathFor("PARENT", "el")).toBe("/el/login/parent");
    expect(loginPathFor("STUDENT", "en")).toBe("/en/login/student");
  });

  it("sends every staff role, chaperones included, to the staff login", () => {
    for (const r of ["TEACHER", "HEADMASTER", "HEADTEACHER_A", "HEADTEACHER_B", "STUDENT_COUNSELOR", "SCHOOL_ADMIN", "SUPER_ADMIN", "CHAPERONE"]) {
      expect(loginPathFor(r, "el")).toBe("/el/login/staff");
    }
  });

  it("sends an expired session to the staff login and defaults to Greek", () => {
    expect(loginPathFor(undefined, null)).toBe("/el/login/staff");
    expect(loginPathFor("PARENT", "fr")).toBe("/el/login/parent");
  });
});

describe("loginPathForPortal", () => {
  it("staff portals → staff login, keeping the locale", () => {
    expect(loginPathForPortal("/el/teacher/dashboard")).toBe("/el/login/staff");
    expect(loginPathForPortal("/en/admin")).toBe("/en/login/staff");
    expect(loginPathForPortal("/office")).toBe("/el/login/staff");
    expect(loginPathForPortal("/el/chaperone/students")).toBe("/el/login/staff");
  });

  it("parent and student portals → their own login pages", () => {
    expect(loginPathForPortal("/el/parent/children")).toBe("/el/login/parent");
    expect(loginPathForPortal("/en/student/grades")).toBe("/en/login/student");
    expect(loginPathForPortal("/student")).toBe("/el/login/student");
  });
});

describe("loginPathForPortal — the bare site address", () => {
  it("opens the chooser, keeping the locale", () => {
    expect(loginPathForPortal("/")).toBe("/el/login");
    expect(loginPathForPortal("/el")).toBe("/el/login");
    expect(loginPathForPortal("/en/")).toBe("/en/login");
  });
});

describe("redirectTo", () => {
  it("redirects with a relative Location, never a host", () => {
    const res = redirectTo("/el/login/staff");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/el/login/staff");
  });
});

describe("publicOrigin", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("prefers the forwarded host and protocol set by the reverse proxy", () => {
    expect(publicOrigin(h({ "x-forwarded-host": "sms.school.cy", "x-forwarded-proto": "https", host: "app:3000" }), "http://localhost:3000/el")).toBe("https://sms.school.cy");
  });

  it("uses the Host header when nothing was forwarded", () => {
    expect(publicOrigin(h({ host: "192.168.1.10:3000" }), "http://localhost:3000/el")).toBe("http://192.168.1.10:3000");
  });

  it("takes the first value of a comma-separated header", () => {
    expect(publicOrigin(h({ "x-forwarded-host": "sms.school.cy, proxy", "x-forwarded-proto": "https,http" }), "http://localhost:3000/")).toBe("https://sms.school.cy");
  });
});
