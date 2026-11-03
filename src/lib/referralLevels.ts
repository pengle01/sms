// Who decides a student on a referral, and how far they may go. Three levels,
// one-way:
//   homegroup headteacher (expulsion ≤ 2 days) → headmaster (≤ 4)
//   → «Πειθαρχικό Συμβούλιο» (≤ 6), run by the headteacher the admin designates.
// A limit counts expulsion DATES: a part of a day counts as one.
// «Αποβολή με Αναστολή» is not limited per level. Pure; unit-tested.

import type { ReferralLevel, Role } from "@/generated/prisma/enums";

export const EXPULSION_MAX_DAYS: Record<ReferralLevel, number> = {
  HOMEGROUP: 2,
  HEADMASTER: 4,
  COUNCIL: 6,
};

/** Who decides at each level — the referral pages, pills and the print. */
export const LEVEL_LABEL: Record<ReferralLevel, string> = {
  HOMEGROUP: "Β.Δ. τμήματος",
  HEADMASTER: "Διευθυντής/ντρια",
  COUNCIL: "Πειθαρχικό Συμβούλιο",
};

/** The signature line of a decision taken at this level. */
export const LEVEL_SIGNER: Record<ReferralLevel, string> = {
  HOMEGROUP: "Ο/Η Βοηθός Διευθυντής/ντρια",
  HEADMASTER: "Ο/Η Διευθυντής/ντρια",
  COUNCIL: "Για το Πειθαρχικό Συμβούλιο",
};

/** «Παραπομπή …» — the button that sends a student to this level. */
export const ESCALATE_TO_LABEL: Partial<Record<ReferralLevel, string>> = {
  HEADMASTER: "Παραπομπή στον/στη Διευθυντή/ντρια",
  COUNCIL: "Παραπομπή στο Πειθαρχικό Συμβούλιο",
};

export function nextLevel(level: ReferralLevel): ReferralLevel | null {
  if (level === "HOMEGROUP") return "HEADMASTER";
  if (level === "HEADMASTER") return "COUNCIL";
  return null;
}

export interface ReferralViewer {
  /** Primary + admin-granted roles. */
  roles: readonly Role[];
  /** Groups whose homegroup headteacher (Β.Δ.) the viewer is. */
  headGroupIds: readonly string[];
  /** The designated «Πειθαρχικό Συμβούλιο» headteacher. */
  isCouncil: boolean;
}

export interface ReferralStudentLite {
  groupId: string | null;
  level: ReferralLevel;
  /** Already decided (a resolution exists). */
  resolved: boolean;
}

/** May this viewer decide (resolve or refer up) a student at their level? */
export function canDecideAt(rs: Pick<ReferralStudentLite, "groupId" | "level">, viewer: ReferralViewer): boolean {
  if (rs.level === "HOMEGROUP") return rs.groupId != null && viewer.headGroupIds.includes(rs.groupId);
  if (rs.level === "HEADMASTER") return viewer.roles.includes("HEADMASTER");
  return viewer.isCouncil;
}

/** May this viewer resolve this student now? */
export function canResolve(rs: ReferralStudentLite, viewer: ReferralViewer): boolean {
  return !rs.resolved && canDecideAt(rs, viewer);
}

/** May this viewer send this student up a level? */
export function canEscalate(rs: ReferralStudentLite, viewer: ReferralViewer): boolean {
  return !rs.resolved && nextLevel(rs.level) !== null && canDecideAt(rs, viewer);
}

/** The expulsion limit when several students are resolved at once: the strictest. */
export function expulsionLimitFor(levels: readonly ReferralLevel[]): number {
  return Math.min(...levels.map((l) => EXPULSION_MAX_DAYS[l]));
}
