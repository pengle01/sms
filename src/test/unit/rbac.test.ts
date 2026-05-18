import { describe, it, expect } from "vitest";
import {
  hasMinRole,
  isStaff,
  isManagement,
  canViewCounselorNotes,
  canViewAllReferrals,
  getPortalForRole,
} from "@/lib/rbac";

describe("RBAC utilities", () => {
  describe("hasMinRole", () => {
    it("super admin has all access", () => {
      expect(hasMinRole("SUPER_ADMIN", "PARENT")).toBe(true);
      expect(hasMinRole("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
    });

    it("parent does not have staff access", () => {
      expect(hasMinRole("PARENT", "TEACHER")).toBe(false);
    });

    it("headmaster has headteacher access", () => {
      expect(hasMinRole("HEADMASTER", "HEADTEACHER_A")).toBe(true);
    });

    it("teacher does not have headmaster access", () => {
      expect(hasMinRole("TEACHER", "HEADMASTER")).toBe(false);
    });
  });

  describe("isStaff", () => {
    it("returns true for all staff roles", () => {
      expect(isStaff("SUPER_ADMIN")).toBe(true);
      expect(isStaff("HEADMASTER")).toBe(true);
      expect(isStaff("TEACHER")).toBe(true);
      expect(isStaff("SCHOOL_ADMIN")).toBe(true);
    });

    it("returns false for student and parent", () => {
      expect(isStaff("STUDENT")).toBe(false);
      expect(isStaff("PARENT")).toBe(false);
    });
  });

  describe("isManagement", () => {
    it("headmaster and headteachers are management", () => {
      expect(isManagement("HEADMASTER")).toBe(true);
      expect(isManagement("HEADTEACHER_A")).toBe(true);
      expect(isManagement("HEADTEACHER_B")).toBe(true);
    });

    it("teacher and counselor are not management", () => {
      expect(isManagement("TEACHER")).toBe(false);
      expect(isManagement("STUDENT_COUNSELOR")).toBe(false);
    });
  });

  describe("canViewCounselorNotes", () => {
    it("allows counselor, headmaster, super admin", () => {
      expect(canViewCounselorNotes("STUDENT_COUNSELOR")).toBe(true);
      expect(canViewCounselorNotes("HEADMASTER")).toBe(true);
      expect(canViewCounselorNotes("SUPER_ADMIN")).toBe(true);
    });

    it("denies teacher, student, parent", () => {
      expect(canViewCounselorNotes("TEACHER")).toBe(false);
      expect(canViewCounselorNotes("STUDENT")).toBe(false);
      expect(canViewCounselorNotes("PARENT")).toBe(false);
    });
  });

  describe("canViewAllReferrals", () => {
    it("management and counselor can view all", () => {
      expect(canViewAllReferrals("HEADMASTER")).toBe(true);
      expect(canViewAllReferrals("STUDENT_COUNSELOR")).toBe(true);
      expect(canViewAllReferrals("SUPER_ADMIN")).toBe(true);
    });

    it("teacher cannot view all referrals", () => {
      expect(canViewAllReferrals("TEACHER")).toBe(false);
    });
  });

  describe("getPortalForRole", () => {
    it("routes staff to admin portal", () => {
      expect(getPortalForRole("HEADMASTER")).toBe("admin");
      expect(getPortalForRole("TEACHER")).toBe("admin");
      expect(getPortalForRole("SCHOOL_ADMIN")).toBe("admin");
    });

    it("routes student to student portal", () => {
      expect(getPortalForRole("STUDENT")).toBe("student");
    });

    it("routes parent to parent portal", () => {
      expect(getPortalForRole("PARENT")).toBe("parent");
    });
  });
});
