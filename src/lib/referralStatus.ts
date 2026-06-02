// Pure referral status helpers — no DB imports, safe for client + server.

export type ReferralStatus = "DRAFT" | "PENDING" | "PARTIAL" | "RESOLVED";

// Traffic-light colour shown at a glance to everyone who can see a referral:
//   RED    — filed but the headteacher has not opened it yet (and nothing resolved)
//   YELLOW — opened / in progress (some but not all students resolved)
//   GREEN  — every student has been dealt with
//   GRAY   — still a draft (not yet filed)
export type ReferralColor = "GRAY" | "RED" | "YELLOW" | "GREEN";

type ReferralLike = {
  isDraft: boolean;
  openedAt?: Date | string | null;
  students: { status: string }[];
};

// Overall status derived from per-student state — the DB has no Referral.status field.
export function overallStatus(r: { isDraft: boolean; students: { status: string }[] }): ReferralStatus {
  if (r.isDraft) return "DRAFT";
  if (r.students.length === 0) return "PENDING";
  const resolved = r.students.filter((s) => s.status === "RESOLVED").length;
  if (resolved === 0) return "PENDING";
  if (resolved === r.students.length) return "RESOLVED";
  return "PARTIAL";
}

export function referralColor(r: ReferralLike): ReferralColor {
  if (r.isDraft) return "GRAY";
  const total = r.students.length;
  const resolved = r.students.filter((s) => s.status === "RESOLVED").length;
  if (total > 0 && resolved === total) return "GREEN";
  // Any resolution means it was necessarily opened; an explicit openedAt also counts.
  if (resolved > 0 || r.openedAt) return "YELLOW";
  return "RED";
}
