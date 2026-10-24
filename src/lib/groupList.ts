// «Τμήματα» in «Πού βρίσκεται»: find any group — homegroup, lesson/elective
// group or support group — see its students and print the list. Pure; the
// page is src/components/whereabouts/Whereabouts.tsx (GroupsTab), the print
// sheet src/app/[locale]/(portal)/print/group/page.tsx.

import type { Role } from "@/generated/prisma/enums";
import { isAdminStaff, isEducator, isOfficeAdmin } from "@/lib/rbac";
import { parseSupportGroup } from "@/lib/specialEd";
import { matchesSearch } from "@/lib/textSearch";

export type GroupKind = "homegroup" | "lesson" | "support";

/**
 * Support groups (ΣΤ_/ΑΣΤ_) by name; a homegroup is a group students belong to
 * as their homegroup (StudentProfile.groupId); everything else is a lesson
 * group — an elective, a split class, a lab group.
 */
export function groupKind(name: string, homegroupMembers: number): GroupKind {
  if (parseSupportGroup(name)) return "support";
  return homegroupMembers > 0 ? "homegroup" : "lesson";
}

/**
 * Who sees a group's students: every staff portal (teachers, the office,
 * admin). Support groups only for those with full special-education access —
 * their membership says a student receives support (canViewSpecialEdFull).
 */
export function canSeeGroupList(roles: Role[], kind: GroupKind, specialEdFull: boolean): boolean {
  const staff = roles.some((r) => isEducator(r) || isOfficeAdmin(r) || isAdminStaff(r));
  if (!staff) return false;
  return kind !== "support" || specialEdFull;
}

export interface GroupEntry {
  id: string;
  name: string;
  kind: GroupKind;
}

export interface GroupFilters {
  /** Free text, matched against the name accent-insensitively. */
  q: string;
  grade: number | null;
  kind: GroupKind | null;
}

/** Read the filters from the URL; anything unknown means "no filter". */
export function parseGroupFilters(p: { q?: string; grade?: string; kind?: string }): GroupFilters {
  const grade = Number(p.grade);
  const kinds: GroupKind[] = ["homegroup", "lesson", "support"];
  return {
    q: (p.q ?? "").trim(),
    grade: [1, 2, 3].includes(grade) ? grade : null,
    kind: kinds.includes(p.kind as GroupKind) ? (p.kind as GroupKind) : null,
  };
}

/** Every group passing the filters, homegroups first, then by name (numbers in order). */
export function filterGroups<T extends GroupEntry & { grade: number }>(groups: T[], f: GroupFilters): T[] {
  const rank: Record<GroupKind, number> = { homegroup: 0, lesson: 1, support: 2 };
  return groups
    .filter((g) => (f.grade === null || g.grade === f.grade) && (f.kind === null || g.kind === f.kind))
    .filter((g) => !f.q || matchesSearch(g.name, f.q))
    .sort((a, b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name, "el", { numeric: true }));
}

export interface ListStudent {
  id: string;
  studentId: string;
  name: string;
  /** Their homegroup — shown for lesson/support groups, where it differs per student. */
  homegroup: string | null;
}

/**
 * A group's students: its homegroup members plus those enrolled in it as a
 * subject group, each once, in Greek alphabetical order.
 */
export function groupStudents(rows: ListStudent[]): ListStudent[] {
  const byId = new Map<string, ListStudent>();
  for (const r of rows) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "el"));
}

/** The printable list in a new tab, with «Πίσω» to where it was opened from. */
export function groupListPrintHref(locale: string, groupId: string, back?: string): string {
  const q = new URLSearchParams({ id: groupId });
  if (back) q.set("back", back);
  q.set("auto", "1");
  return `/${locale}/print/group?${q.toString()}`;
}
