// The printable fixed weekly timetable of a teacher, a student or a room — or
// every teacher of one specialty, one page each.
// Pure (no DB) so the access and URL rules are unit-tested; the page is
// src/app/[locale]/(portal)/print/timetable/page.tsx.

import type { Role } from "@/generated/prisma/enums";
import { isAdminStaff, isEducator, isOfficeAdmin } from "@/lib/rbac";

export type PrintKind = "teacher" | "student" | "room" | "specialty";

export interface PrintTarget {
  kind: PrintKind;
  /** Timetable name (teacher), StudentProfile id (student), room name, or specialty code. */
  key: string;
}

/** Parse the page's query; null when the kind is unknown or the key missing. */
export function printTarget(q: { kind?: string; name?: string; id?: string }): PrintTarget | null {
  const kind = q.kind;
  if (kind === "teacher" || kind === "room" || kind === "specialty") {
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
 *  • a teacher's, a specialty's or a room's week: educators, the office and
 *    admin staff («Πού βρίσκεται», the admin timetable);
 *  • a student's week: educators, the office, admin staff, and the student themself.
 */
export function canPrintTimetable(kind: PrintKind, roles: Role[], opts: { selfStudent?: boolean } = {}): boolean {
  const staff = roles.some(isEducator) || roles.some(isAdminStaff);
  if (kind === "student") {
    return staff || roles.some(isOfficeAdmin) || (opts.selfStudent === true && roles.includes("STUDENT"));
  }
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

/** The specialty code a timetable name starts with: "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ" → "ΗΥ",
 *  " Μ - ΠΑΠΑΣ Α." → "Μ". Null when the name has no such prefix. */
export function specialtyCode(scheduleName: string): string | null {
  const m = scheduleName.normalize("NFC").match(/^\s*([Α-ΩΆ-ΏA-Z]{1,3})\s*-/);
  return m ? m[1]! : null;
}

/** Timetable names grouped by specialty code, codes and names in Greek order;
 *  names without a code are left out. */
export function specialtyGroups(scheduleNames: string[]): { code: string; names: string[] }[] {
  const byCode = new Map<string, Set<string>>();
  for (const name of scheduleNames) {
    const code = specialtyCode(name);
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, new Set());
    byCode.get(code)!.add(name.trim());
  }
  const el = (a: string, b: string) => a.localeCompare(b, "el");
  return [...byCode.entries()]
    .sort(([a], [b]) => el(a, b))
    .map(([code, names]) => ({ code, names: [...names].sort(el) }));
}
