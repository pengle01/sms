// A staff member's own details — phone, specialty (department) and ΠΜΠ — typed
// by the person at first sign-in. They're stored on the StaffProfile they're
// linked to, but they belong to the PERSON: when an admin relinks the account
// to another staff record they move with it, and a record left behind keeps
// none (or the next person linked to it would show them). While the account is
// linked to nothing they wait on User.staffDetails. Pure; unit-tested.

export interface StaffDetails {
  phone: string | null;
  department: string | null;
  pmp: string | null;
}

export const EMPTY_DETAILS: StaffDetails = { phone: null, department: null, pmp: null };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** The stash on User.staffDetails, tolerating anything stored there. */
export function parseStaffDetails(raw: unknown): StaffDetails {
  if (!raw || typeof raw !== "object") return { ...EMPTY_DETAILS };
  const o = raw as Record<string, unknown>;
  return { phone: str(o.phone), department: str(o.department), pmp: str(o.pmp) };
}

export function pickDetails(p: { phone?: string | null; department?: string | null; pmp?: string | null } | null | undefined): StaffDetails {
  return p ? { phone: str(p.phone), department: str(p.department), pmp: str(p.pmp) } : { ...EMPTY_DETAILS };
}

export function hasAnyDetails(d: StaffDetails): boolean {
  return d.phone !== null || d.department !== null || d.pmp !== null;
}

/**
 * The details the newly linked record should hold: those on the account's
 * current record (a direct relink), else the stash from an earlier unlink,
 * else none. Whatever the target record held belonged to its previous holder.
 */
export function detailsForLink(input: { fromOldProfile: StaffDetails | null; stash: StaffDetails | null }): StaffDetails {
  if (input.fromOldProfile && hasAnyDetails(input.fromOldProfile)) return input.fromOldProfile;
  if (input.stash && hasAnyDetails(input.stash)) return input.stash;
  return { ...EMPTY_DETAILS };
}
