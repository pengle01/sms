// «Τμήμα μου» → «Προς διερεύνηση»: marking a student as resolved. The
// resolution keeps the student's patterns as they were (flag key → count); the
// student stays off the list until a new pattern appears or one grows.
// Pure; unit-tested in watchlistResolve.test.ts.

import type { Flag } from "@/lib/behaviorFlags";
import type { GroupRole } from "@/server/behaviorReport";

export type FlagSnapshot = Record<string, number>;

/** One pattern's identity: its code plus the lesson/weekday it is about. */
export function flagKey(f: Pick<Flag, "code" | "course" | "weekday">): string {
  return [f.code, f.course ?? "", f.weekday ?? ""].join("|");
}

/** The patterns to store with a resolution (the highest count per key). */
export function flagSnapshot(flags: Flag[]): FlagSnapshot {
  const out: FlagSnapshot = {};
  for (const f of flags) {
    const k = flagKey(f);
    out[k] = Math.max(out[k] ?? 0, f.count);
  }
  return out;
}

/** Read a stored snapshot defensively (it is JSON in the database). */
export function parseFlagSnapshot(raw: unknown): FlagSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: FlagSnapshot = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * Still resolved: every current pattern was already there when it was
 * resolved, with no higher count. A new pattern, or a grown one, brings the
 * student back.
 */
export function stillResolved(flags: Flag[], snapshot: FlagSnapshot): boolean {
  return flags.every((f) => {
    const before = snapshot[flagKey(f)];
    return before !== undefined && f.count <= before;
  });
}

/** Only the homegroup's deputy headteacher marks students as resolved. */
export function canResolveWatchlist(roles: GroupRole[]): boolean {
  return roles.includes("head");
}
