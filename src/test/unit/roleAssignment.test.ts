import { describe, it, expect } from "vitest";
import {
  effectiveRoles,
  isEffectiveSuperAdmin,
  validateAdminGrant,
  validateAdminRevoke,
  validateUserDelete,
} from "@/lib/roleAssignment";

describe("effectiveRoles", () => {
  it("combines primary and extra roles, primary first, deduplicated", () => {
    expect(effectiveRoles("TEACHER", ["SUPER_ADMIN"])).toEqual(["TEACHER", "SUPER_ADMIN"]);
    expect(effectiveRoles("SUPER_ADMIN", ["SUPER_ADMIN"])).toEqual(["SUPER_ADMIN"]);
    expect(effectiveRoles("TEACHER", [])).toEqual(["TEACHER"]);
  });
});

describe("isEffectiveSuperAdmin", () => {
  it("accepts primary or extra SUPER_ADMIN", () => {
    expect(isEffectiveSuperAdmin("SUPER_ADMIN", [])).toBe(true);
    expect(isEffectiveSuperAdmin("TEACHER", ["SUPER_ADMIN"])).toBe(true);
  });

  it("rejects everyone else", () => {
    expect(isEffectiveSuperAdmin("TEACHER", [])).toBe(false);
    expect(isEffectiveSuperAdmin("HEADMASTER", [])).toBe(false);
  });
});

describe("validateAdminGrant", () => {
  const base = {
    actorId: "admin1",
    targetId: "user2",
    targetPrimary: "TEACHER" as const,
    targetExtra: [],
    targetActive: true,
  };

  it("allows granting to an active staff user", () => {
    expect(validateAdminGrant(base)).toEqual({ ok: true });
  });

  it("blocks granting to yourself", () => {
    expect(validateAdminGrant({ ...base, targetId: "admin1" })).toEqual({
      ok: false,
      error: "errSelf",
    });
  });

  it("blocks granting to inactive accounts", () => {
    expect(validateAdminGrant({ ...base, targetActive: false })).toEqual({
      ok: false,
      error: "errInactive",
    });
  });

  it("blocks granting to existing admins (primary or extra)", () => {
    expect(validateAdminGrant({ ...base, targetPrimary: "SUPER_ADMIN" })).toEqual({
      ok: false,
      error: "errAlreadyAdmin",
    });
    expect(validateAdminGrant({ ...base, targetExtra: ["SUPER_ADMIN"] })).toEqual({
      ok: false,
      error: "errAlreadyAdmin",
    });
  });
});

describe("validateAdminRevoke", () => {
  const base = {
    actorId: "admin1",
    targetId: "user2",
    targetPrimary: "TEACHER" as const,
    targetExtra: ["SUPER_ADMIN" as const],
    effectiveSuperAdmins: 2,
  };

  it("allows revoking a granted extra role when other admins remain", () => {
    expect(validateAdminRevoke(base)).toEqual({ ok: true });
  });

  it("blocks revoking your own access", () => {
    expect(validateAdminRevoke({ ...base, targetId: "admin1" })).toEqual({
      ok: false,
      error: "errSelf",
    });
  });

  it("never touches a primary SUPER_ADMIN role", () => {
    expect(validateAdminRevoke({ ...base, targetPrimary: "SUPER_ADMIN" })).toEqual({
      ok: false,
      error: "errPrimaryAdmin",
    });
  });

  it("blocks revoking when nothing was granted", () => {
    expect(validateAdminRevoke({ ...base, targetExtra: [] })).toEqual({
      ok: false,
      error: "errNotGranted",
    });
  });

  it("refuses to drop the last remaining administrator", () => {
    expect(validateAdminRevoke({ ...base, effectiveSuperAdmins: 1 })).toEqual({
      ok: false,
      error: "errLastSuperAdmin",
    });
  });
});

describe("validateUserDelete", () => {
  const base = {
    actorId: "admin1",
    targetId: "user2",
    targetPrimary: "TEACHER" as const,
    targetExtra: [] as ("SUPER_ADMIN")[],
    effectiveSuperAdmins: 2,
  };

  it("allows deleting an ordinary user", () => {
    expect(validateUserDelete(base)).toEqual({ ok: true });
  });

  it("allows deleting an ordinary user even if only one admin exists", () => {
    expect(validateUserDelete({ ...base, effectiveSuperAdmins: 1 })).toEqual({ ok: true });
  });

  it("blocks deleting your own account", () => {
    expect(validateUserDelete({ ...base, targetId: "admin1" })).toEqual({
      ok: false,
      error: "errSelf",
    });
  });

  it("allows deleting a super admin while others remain (primary or extra)", () => {
    expect(validateUserDelete({ ...base, targetPrimary: "SUPER_ADMIN" })).toEqual({ ok: true });
    expect(validateUserDelete({ ...base, targetExtra: ["SUPER_ADMIN"] })).toEqual({ ok: true });
  });

  it("refuses to delete the last super admin (primary)", () => {
    expect(
      validateUserDelete({ ...base, targetPrimary: "SUPER_ADMIN", effectiveSuperAdmins: 1 })
    ).toEqual({ ok: false, error: "errLastSuperAdmin" });
  });

  it("refuses to delete the last super admin (extra grant)", () => {
    expect(
      validateUserDelete({ ...base, targetExtra: ["SUPER_ADMIN"], effectiveSuperAdmins: 1 })
    ).toEqual({ ok: false, error: "errLastSuperAdmin" });
  });

  it("checks self before last-admin", () => {
    expect(
      validateUserDelete({
        ...base,
        targetId: "admin1",
        targetPrimary: "SUPER_ADMIN",
        effectiveSuperAdmins: 1,
      })
    ).toEqual({ ok: false, error: "errSelf" });
  });
});
