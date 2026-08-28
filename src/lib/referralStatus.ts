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

/**
 * May this staff member delete the referral?
 *
 * Only its filer, and only while nobody downstream has acted on it:
 *   - a draft was never filed, so it is the author's alone;
 *   - a filed referral can still be withdrawn until a headteacher opens it
 *     (openedAt), which is the moment it enters someone else's workload.
 *
 * Once it has been opened, or any student already carries a resolution, it is
 * part of the disciplinary record and stays — a resolution implies it was
 * opened, but it is checked separately rather than trusted to imply openedAt.
 */
export function canDeleteReferral(
  r: {
    isDraft: boolean;
    openedAt?: Date | string | null;
    filerId: string;
    students: { status: string }[];
  },
  staffId: string | null | undefined,
): boolean {
  if (!staffId || r.filerId !== staffId) return false;
  if (r.isDraft) return true;
  if (r.openedAt) return false;
  return r.students.every((s) => s.status !== "RESOLVED");
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

// A referral can involve students from several homegroups, i.e. several
// headteachers. Each headteacher is only responsible for the students in their
// own group(s), so the colour they see is computed from that slice alone — a
// headteacher whose own students are all resolved sees GREEN even while another
// group is still pending. Passing no/empty groupIds falls back to the overall
// colour (the view shown to the filing teacher and to management).
type ScopedReferralLike = {
  isDraft: boolean;
  openedAt?: Date | string | null;
  students: { status: string; groupId?: string | null }[];
};

export function referralColorScoped(
  r: ScopedReferralLike,
  groupIds?: string[] | null
): ReferralColor {
  if (!groupIds || groupIds.length === 0) return referralColor(r);
  const scoped = r.students.filter((s) => s.groupId != null && groupIds.includes(s.groupId));
  // Viewer isn't actually involved in this referral — show the overall colour.
  if (scoped.length === 0) return referralColor(r);
  return referralColor({ isDraft: r.isDraft, openedAt: r.openedAt, students: scoped });
}

// Per-group progress, one entry per distinct homegroup involved, each coloured
// by that group's own resolution state. Lets a teacher (or management) see at a
// glance how far each responsible headteacher has got. Drafts get no signals.
export function referralGroupSignals(
  r: ScopedReferralLike
): { groupId: string; color: ReferralColor }[] {
  if (r.isDraft) return [];
  const byGroup = new Map<string, { status: string }[]>();
  for (const s of r.students) {
    if (!s.groupId) continue;
    const list = byGroup.get(s.groupId) ?? [];
    list.push({ status: s.status });
    byGroup.set(s.groupId, list);
  }
  return [...byGroup.entries()].map(([groupId, students]) => ({
    groupId,
    color: referralColor({ isDraft: false, openedAt: r.openedAt, students }),
  }));
}
