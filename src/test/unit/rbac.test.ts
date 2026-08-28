import { describe, it, expect } from "vitest";
import {
  hasMinRole,
  isStaff,
  isManagement,
  isEducator,
  isOfficeAdmin,
  isAdminStaff,
  canManageClaims,
  canViewCounselorNotes,
  canViewAllReferrals,
  getPortalForRole,
  EDUCATOR_ROLES,
  SELF_REGISTER_EDUCATOR_ROLES,
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
    it("routes super admin to admin portal", () => {
      expect(getPortalForRole("SUPER_ADMIN")).toBe("admin");
    });

    it("routes educator roles to teacher portal", () => {
      expect(getPortalForRole("HEADMASTER")).toBe("teacher");
      expect(getPortalForRole("HEADTEACHER_A")).toBe("teacher");
      expect(getPortalForRole("HEADTEACHER_B")).toBe("teacher");
      expect(getPortalForRole("STUDENT_COUNSELOR")).toBe("teacher");
      expect(getPortalForRole("TEACHER")).toBe("teacher");
    });

    it("routes school admin to office portal", () => {
      expect(getPortalForRole("SCHOOL_ADMIN")).toBe("office");
    });

    it("routes student to student portal", () => {
      expect(getPortalForRole("STUDENT")).toBe("student");
    });

    it("routes parent to parent portal", () => {
      expect(getPortalForRole("PARENT")).toBe("parent");
    });

    it("routes chaperone to chaperone portal", () => {
      expect(getPortalForRole("CHAPERONE")).toBe("chaperone");
    });
  });

  describe("isEducator", () => {
    it("returns true for all educator roles", () => {
      expect(isEducator("HEADMASTER")).toBe(true);
      expect(isEducator("HEADTEACHER_A")).toBe(true);
      expect(isEducator("HEADTEACHER_B")).toBe(true);
      expect(isEducator("STUDENT_COUNSELOR")).toBe(true);
      expect(isEducator("TEACHER")).toBe(true);
    });

    it("returns false for non-educator roles", () => {
      expect(isEducator("SUPER_ADMIN")).toBe(false);
      expect(isEducator("SCHOOL_ADMIN")).toBe(false);
      expect(isEducator("STUDENT")).toBe(false);
      expect(isEducator("PARENT")).toBe(false);
    });
  });

  describe("isOfficeAdmin", () => {
    it("returns true only for SCHOOL_ADMIN", () => {
      expect(isOfficeAdmin("SCHOOL_ADMIN")).toBe(true);
    });

    it("returns false for other roles", () => {
      expect(isOfficeAdmin("SUPER_ADMIN")).toBe(false);
      expect(isOfficeAdmin("TEACHER")).toBe(false);
      expect(isOfficeAdmin("HEADMASTER")).toBe(false);
    });
  });

  describe("isAdminStaff", () => {
    it("returns true only for SUPER_ADMIN", () => {
      expect(isAdminStaff("SUPER_ADMIN")).toBe(true);
    });

    it("returns false for all other roles", () => {
      expect(isAdminStaff("HEADMASTER")).toBe(false);
      expect(isAdminStaff("SCHOOL_ADMIN")).toBe(false);
      expect(isAdminStaff("TEACHER")).toBe(false);
    });
  });

  describe("canManageClaims", () => {
    it("allows only SUPER_ADMIN to manage claims", () => {
      expect(canManageClaims("SUPER_ADMIN")).toBe(true);
    });

    it("denies all other roles", () => {
      expect(canManageClaims("HEADMASTER")).toBe(false);
      expect(canManageClaims("TEACHER")).toBe(false);
      expect(canManageClaims("SCHOOL_ADMIN")).toBe(false);
    });
  });

  // Membership in this set is what makes registration approval call
  // linkStaffProfile(), so a role that needs a StaffProfile must be listed —
  // the counselor was missing, which left them uncreatable and made the
  // homegroup counselor dropdown permanently empty.
  describe("SELF_REGISTER_EDUCATOR_ROLES", () => {
    it("includes the student counselor", () => {
      expect(SELF_REGISTER_EDUCATOR_ROLES).toContain("STUDENT_COUNSELOR");
    });

    it("includes the teacher and every management role", () => {
      expect(SELF_REGISTER_EDUCATOR_ROLES).toContain("TEACHER");
      expect(SELF_REGISTER_EDUCATOR_ROLES).toContain("HEADTEACHER_B");
      expect(SELF_REGISTER_EDUCATOR_ROLES).toContain("HEADTEACHER_A");
      expect(SELF_REGISTER_EDUCATOR_ROLES).toContain("HEADMASTER");
    });

    it("contains only educator roles", () => {
      for (const role of SELF_REGISTER_EDUCATOR_ROLES) {
        expect(EDUCATOR_ROLES).toContain(role);
      }
    });

    it("excludes office and chaperone, which register without a timetable claim", () => {
      expect(SELF_REGISTER_EDUCATOR_ROLES).not.toContain("SCHOOL_ADMIN");
      expect(SELF_REGISTER_EDUCATOR_ROLES).not.toContain("CHAPERONE");
    });

    it("excludes families and the system admin", () => {
      expect(SELF_REGISTER_EDUCATOR_ROLES).not.toContain("STUDENT");
      expect(SELF_REGISTER_EDUCATOR_ROLES).not.toContain("PARENT");
      expect(SELF_REGISTER_EDUCATOR_ROLES).not.toContain("SUPER_ADMIN");
    });

    it("every listed role lands in the teacher portal", () => {
      for (const role of SELF_REGISTER_EDUCATOR_ROLES) {
        expect(getPortalForRole(role)).toBe("teacher");
      }
    });
  });
});
