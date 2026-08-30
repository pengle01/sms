// The admin staff roster's filter — pure helpers, unit-tested, no DB.
import type { Role } from "@/generated/prisma/client";
import { matchesSearch } from "@/lib/textSearch";
import { MANAGEMENT_ROLES } from "@/lib/rbac";
import { specialtyPrefix, isManagementName } from "@/lib/substitutions";

/**
 * One person on the admin roster.
 *
 * The roster is a union, not a table: every StaffProfile (including the ~124
 * that are only a name from the timetable import) plus the staff accounts that
 * have no profile at all — the SUPER_ADMIN and the SCHOOL_ADMIN, who never
 * appear in the schedule. Either half can be missing its counterpart, so both
 * `userId` and `scheduleName` are nullable.
 */
export interface StaffRow {
  /** null ⇒ a roster entry from the timetable, nobody has signed up as them yet. */
  userId: string | null;
  staffProfileId: string | null;
  scheduleName: string | null;
  name: string | null;
  nameEl: string | null;
  email: string | null;
  phone: string | null;
  /** null ⇒ no account, so no role has been granted yet. */
  role: Role | null;
  isActive: boolean;
  extraAdmin: boolean;
  specialEducation: boolean;
  ddkCoordinator: boolean;
  substitutionCoordinator: boolean;
  homerooms: string[];
  /** Lessons a week. Counted by staffName, never by staffId — see lessonsByName. */
  lessons: number;
}

/**
 * Three states, not two.
 *
 * A profile with a schedule name but no user is a roster entry the timetable
 * import created for someone who has not signed up yet — expected, and there
 * are ~124 of them. A profile with neither is orphaned (its user was deleted)
 * and genuinely wants attention. Colouring the first group amber would make the
 * alarm permanent, which is why only the second is ever highlighted.
 */
export type StaffStatus = "linked" | "awaiting" | "orphaned";

export function staffStatus(row: StaffRow): StaffStatus {
  if (row.userId) return "linked";
  return row.scheduleName ? "awaiting" : "orphaned";
}

/** The specialty coded into the schedule name: "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ" → "ΗΥ". */
export function staffSpecialty(row: StaffRow): string {
  return specialtyPrefix(row.scheduleName);
}

/**
 * Is this person management?
 *
 * Answered from the schedule marker (Δ / ΒΔΑ / ΒΔ) as well as the account role,
 * because most of the roster has no account yet: 16 profiles carry a marker
 * while only 4 hold a management role. Going by role alone would hide every
 * deputy who has not signed up.
 */
export function isManagementRow(row: StaffRow): boolean {
  if (row.role && MANAGEMENT_ROLES.includes(row.role)) return true;
  return isManagementName(row.scheduleName);
}

/** The name to show and to sort by: schedule coding first, account name as fallback. */
export function staffRowLabel(row: StaffRow): string {
  return row.scheduleName ?? row.name ?? "";
}

/** The extra hats an admin grants on top of the role. Keys are URL values. */
export type StaffPost = "specialEd" | "ddk" | "subCoord" | "homeroom" | "extraAdmin";

const POST_PREDICATE: Record<StaffPost, (r: StaffRow) => boolean> = {
  specialEd:  (r) => r.specialEducation,
  ddk:        (r) => r.ddkCoordinator,
  subCoord:   (r) => r.substitutionCoordinator,
  homeroom:   (r) => r.homerooms.length > 0,
  extraAdmin: (r) => r.extraAdmin,
};

export function isStaffPost(value: string | undefined): value is StaffPost {
  return !!value && value in POST_PREDICATE;
}

/**
 * Is there a phone number on file?
 *
 * Whitespace counts as absent: a row saved with a space in the box is no more
 * dialable than an empty one, and the directory would otherwise show a blank
 * cell under the "has a number" filter.
 */
export function hasPhone(row: StaffRow): boolean {
  return !!row.phone && row.phone.trim() !== "";
}

export interface StaffFilter {
  /** One of the three link states, or undefined for all. */
  status?: string;
  /** A single specialty prefix ("ΗΥ"), or undefined for all. */
  specialty?: string;
  /** A Role, or the derived pseudo-role "management". Undefined for all. */
  role?: string;
  /** A single designation, or undefined for all. */
  post?: string;
  /** "present" | "missing" — whether a phone number is on file. */
  phone?: string;
  /** Free text over the schedule name, both account names and the email. */
  q?: string;
}

/**
 * Narrow the staff roster.
 *
 * In memory rather than in the query, for the same reasons as filterCohort: the
 * roster is ~140 rows and is already loaded whole to count the pills, and the
 * awkward part — matching a Greek name typed without accents, or with a final ς
 * where the record has σ — is only possible here. Postgres `mode: "insensitive"`
 * folds case but not accents, so «παπαδοπουλου» would never reach
 * «Παπαδοπούλου» through a `contains` clause.
 */
export function filterStaff<T extends StaffRow>(rows: T[], f: StaffFilter): T[] {
  const q = (f.q ?? "").trim();
  return rows.filter((r) => {
    if (f.status && staffStatus(r) !== f.status) return false;
    if (f.specialty && staffSpecialty(r) !== f.specialty) return false;
    if (f.role) {
      if (f.role === "management") {
        if (!isManagementRow(r)) return false;
      } else if (r.role !== f.role) return false;
    }
    if (isStaffPost(f.post) && !POST_PREDICATE[f.post](r)) return false;
    if (f.phone === "present" && !hasPhone(r)) return false;
    if (f.phone === "missing" && hasPhone(r)) return false;
    if (
      q &&
      !matchesSearch(r.scheduleName, q) &&
      !matchesSearch(r.name, q) &&
      !matchesSearch(r.nameEl, q) &&
      !matchesSearch(r.email, q)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Specialty prefixes present on the roster, commonest first — the pill options.
 * Feed this the UNFILTERED roster so a pill never vanishes because of the
 * current selection. Profiles with no schedule name have no prefix and are
 * skipped rather than collected under "".
 */
export function staffSpecialties(rows: StaffRow[]): { code: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const code = staffSpecialty(r);
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, "el"));
}

/** Roster order: display name, Greek collation. */
export function sortStaff<T extends StaffRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => staffRowLabel(a).localeCompare(staffRowLabel(b), "el"));
}

/**
 * Lessons a week, keyed by schedule name.
 *
 * TimetableSlot.staffId is only stamped when a teacher claims their name at
 * sign-up — 221 of 2167 slots carry one — so counting a profile's `timetableSlots`
 * relation reports 0 for every teacher who has not registered. The raw
 * `staffName` on the slot is what the import always writes, and it matches
 * StaffProfile.scheduleName exactly.
 */
export function lessonsByName(
  slots: { staffName: string | null; _count: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of slots) {
    if (!s.staffName) continue;
    m.set(s.staffName, (m.get(s.staffName) ?? 0) + s._count);
  }
  return m;
}

/** URL keys this filter owns — shared by the pill links and the row links. */
export const STAFF_KEYS = ["status", "sp", "role", "post", "q"] as const;

/**
 * The directory's own, shorter key list. It offers only specialty, phone and
 * search, so it does not carry the roster's status/role/post params around in
 * every link just to drop them.
 */
export const STAFF_DIRECTORY_KEYS = ["sp", "phone", "q"] as const;

/**
 * Translate the pre-filter-bar `?role=` values.
 *
 * The old page overloaded one param for three different things: a Role, the
 * link state ("unlinked") and a designation. Existing links are all internal,
 * but an open tab or a bookmark should still land somewhere sensible.
 */
export function migrateLegacyRole(
  role: string | undefined,
): { status?: string; role?: string; post?: string } {
  if (!role) return {};
  if (role === "unlinked") return { status: "awaiting" };
  if (isStaffPost(role)) return { post: role };
  if (role === "all") return {};
  return { role };
}
