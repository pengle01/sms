// Rules for deleting a student record — pure, unit-tested, no DB.
import type { Role } from "@/generated/prisma/client";

/**
 * The kinds of record that make a student "have history".
 *
 * A student with any of these cannot be deleted, only deactivated. Some of them
 * the database protects anyway (attendance, grades, referrals, exit permits,
 * activities and SMS logs are RESTRICT foreign keys, so a delete would fail);
 * the others it would silently cascade away (the special-ed record, message
 * threads, ΔΔΚ awards, toilet breaks). Both halves are listed so nothing is lost
 * by accident — deleting is only for records that never had a life, such as a
 * duplicate or a wrong import.
 *
 * Group memberships, guardian links, SMS recipients and access codes are NOT
 * history: they describe the student rather than record what happened, and are
 * removed together with the record.
 */
export const HISTORY_KEYS = [
  "attendance",
  "grades",
  "testGrades",
  "referrals",
  "exitPermits",
  "activities",
  "smsLogs",
  "specialEd",
  "conversations",
  "ddkAwards",
  "toiletBreaks",
] as const;

export type HistoryKey = (typeof HISTORY_KEYS)[number];
export type StudentHistoryCounts = Record<HistoryKey, number>;
export type HistoryBlocker = { key: HistoryKey; count: number };

/** The shape Prisma returns for `_count` plus the one-to-one special-ed record. */
export interface RawStudentHistory {
  _count: {
    attendance: number;
    grades: number;
    testGrades: number;
    referrals: number; // legacy single-student Referral.studentId
    referralStudents: number;
    exitPermits: number;
    activityParticipations: number;
    smsLogs: number;
    conversations: number;
    ddkAwards: number;
    toiletBreaks: number;
  };
  specialEd: { id: string } | null;
}

export function toHistoryCounts(raw: RawStudentHistory): StudentHistoryCounts {
  const c = raw._count;
  return {
    attendance: c.attendance,
    grades: c.grades,
    testGrades: c.testGrades,
    // Both the multi-student join rows and the legacy single-student column.
    referrals: c.referrals + c.referralStudents,
    exitPermits: c.exitPermits,
    activities: c.activityParticipations,
    smsLogs: c.smsLogs,
    specialEd: raw.specialEd ? 1 : 0,
    conversations: c.conversations,
    ddkAwards: c.ddkAwards,
    toiletBreaks: c.toiletBreaks,
  };
}

/** What stands in the way of deleting, in display order. Empty ⇒ deletable. */
export function historyBlockers(counts: StudentHistoryCounts): HistoryBlocker[] {
  return HISTORY_KEYS.filter((k) => counts[k] > 0).map((key) => ({ key, count: counts[key] }));
}

/**
 * The typed confirmation: the person must type the student's registry number.
 * Whitespace-tolerant, otherwise exact. A student with no registry number can
 * never be confirmed, rather than being confirmable by typing nothing.
 */
export function confirmsDeletion(typed: string | null | undefined, registryNumber: string): boolean {
  const expected = registryNumber.trim();
  return expected !== "" && (typed ?? "").trim() === expected;
}

/**
 * What happens to the student's login once the record is gone.
 *
 * "delete"     — a student account with no audit trail of its own.
 * "deactivate" — the account wrote audit rows (e.g. it activated itself).
 *                AuditLog.userId is RESTRICT and the trail must never be erased,
 *                so the account is locked out instead: inactive, no password.
 * "keep"       — not a STUDENT account. Never delete a user of another role
 *                just because a student profile pointed at it.
 */
export type StudentUserDisposition = "delete" | "deactivate" | "keep";

export function studentUserDisposition(role: Role, auditRowCount: number): StudentUserDisposition {
  if (role !== "STUDENT") return "keep";
  return auditRowCount > 0 ? "deactivate" : "delete";
}
