// The printable fixed weekly timetable of a teacher, a student or a room.
// Pure (no DB) so the access and URL rules are unit-tested; the page is
// src/app/[locale]/(portal)/print/timetable/page.tsx.

import type { Role } from "@/generated/prisma/enums";
import { isAdminStaff, isEducator, isOfficeAdmin } from "@/lib/rbac";

export type PrintKind = "teacher" | "student" | "room";

export interface PrintTarget {
  kind: PrintKind;
  /** Timetable name (teacher), StudentProfile id (student) or room name. */
  key: string;
}

/** Parse the page's query; null when the kind is unknown or the key missing. */
export function printTarget(q: { kind?: string; name?: string; id?: string }): PrintTarget | null {
  const kind = q.kind;
  if (kind === "teacher" || kind === "room") {
    const key = q.name?.trim();
    return key ? { kind, key } : null;
  }
  if (kind === "student") {
    const key = q.id?.trim();
    return key ? { kind, key } : null;
  }
  return null;
}

/**
 * Who may print what — the same people who can view that schedule:
 *  • a teacher's or a room's week: educators, the office and admin staff
 *    («Πού βρίσκεται», the admin timetable);
 *  • a student's week: educators, admin staff, and the student themself.
 */
export function canPrintTimetable(kind: PrintKind, roles: Role[], opts: { selfStudent?: boolean } = {}): boolean {
  const staff = roles.some(isEducator) || roles.some(isAdminStaff);
  if (kind === "student") return staff || (opts.selfStudent === true && roles.includes("STUDENT"));
  return staff || roles.some(isOfficeAdmin);
}

/** The «Πίσω» target: only a path inside this locale, never another site. */
export function safeBack(back: string | undefined, locale: string): string | null {
  if (!back) return null;
  if (!back.startsWith(`/${locale}/`) || back.startsWith("//") || back.includes("\\")) return null;
  return back;
}

export function timetablePrintHref(locale: string, target: PrintTarget, back?: string): string {
  const q = new URLSearchParams({ kind: target.kind });
  q.set(target.kind === "student" ? "id" : "name", target.key);
  if (back) q.set("back", back);
  q.set("auto", "1");
  return `/${locale}/print/timetable?${q.toString()}`;
}
