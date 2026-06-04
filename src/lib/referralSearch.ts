// Pure helpers for the referrals search (by referral no., student name,
// student ID or filing teacher). No DB imports — unit-testable.

export type ReferralSearchTab = "number" | "student" | "studentId" | "filer";

export function parseReferralSearchTab(v: string | undefined | null): ReferralSearchTab {
  return v === "student" || v === "studentId" || v === "filer" ? v : "number";
}

/**
 * Prisma where-fragment for a referral search, or null when the query is
 * empty/invalid (caller skips filtering).
 */
export function referralSearchWhere(tab: ReferralSearchTab, q: string) {
  const term = q.trim();
  if (!term) return null;
  switch (tab) {
    case "number": {
      const n = parseInt(term.replace(/^#/, ""), 10);
      return Number.isInteger(n) && n > 0 ? { number: n } : null;
    }
    case "student":
      return {
        students: {
          some: { student: { user: { name: { contains: term, mode: "insensitive" as const } } } },
        },
      };
    case "studentId":
      return {
        students: {
          some: { student: { studentId: { contains: term, mode: "insensitive" as const } } },
        },
      };
    case "filer":
      return {
        filer: {
          OR: [
            { scheduleName: { contains: term, mode: "insensitive" as const } },
            { user: { name: { contains: term, mode: "insensitive" as const } } },
          ],
        },
      };
  }
}
