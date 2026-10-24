// SMS recipient helpers: phone normalisation + default-number validation.
// The student import file provides a dedicated SMS number per student; it must
// belong to one of the student's parents/guardians, otherwise we flag the
// student for the office to review.

/** Reduce a phone to its significant digits: drop +, spaces, punctuation, the
 *  Cyprus country code (357) and any leading zeros, so "+357 99 123456",
 *  "0099123456" and "99123456" all compare equal. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("357") && d.length > 8) d = d.slice(3);
  d = d.replace(/^0+/, "");
  return d;
}

export type SmsFlagReason = "EMPTY" | "NO_MATCH";

export interface SmsDefaultEvaluation {
  flagged: boolean;
  reason: SmsFlagReason | null;
}

/** The default SMS number must match one of the parent/guardian numbers.
 *  Empty → flagged EMPTY; present but unmatched → flagged NO_MATCH. */
export function evaluateDefaultSms(
  smsPhone: string | null | undefined,
  parentGuardianPhones: (string | null | undefined)[]
): SmsDefaultEvaluation {
  const target = normalizePhone(smsPhone);
  if (!target) return { flagged: true, reason: "EMPTY" };
  const known = new Set(parentGuardianPhones.map(normalizePhone).filter(Boolean));
  if (!known.has(target)) return { flagged: true, reason: "NO_MATCH" };
  return { flagged: false, reason: null };
}

export const SMS_FLAG_REASON_EL: Record<SmsFlagReason, string> = {
  EMPTY: "Δεν δόθηκε αριθμός SMS στο αρχείο.",
  NO_MATCH: "Ο αριθμός SMS δεν αντιστοιχεί σε γονέα ή κηδεμόνα.",
};

/** The import's name for the file's «τηλέφωνο SMS» contact. */
export const SMS_PLACEHOLDER_NAME = "SMS";
/** The import's name for «Τηλέφωνο (1)» when the row names no guardian. */
export const HOME_PHONE_NAME = "Τηλέφωνο οικίας";
/** Name given to a parent's number when the file leaves the parent's name empty. */
const ROLE_NAME: Record<string, string> = { FATHER: "Πατέρας", MOTHER: "Μητέρα", GUARDIAN: "Κηδεμόνας" };

type ContactRole = "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER";

export function isSmsPlaceholder(c: { name: string; role: string }): boolean {
  return c.name.trim() === SMS_PLACEHOLDER_NAME && c.role === "OTHER";
}

export function isHomePhone(c: { name: string; role: string }): boolean {
  return c.name.trim() === HOME_PHONE_NAME && c.role === "OTHER";
}

export interface ImportedContact {
  name: string;
  phone: string;
  role: ContactRole;
}

/**
 * The contacts one row of the student import file yields — every phone column,
 * once per number (compared normalised), in file order:
 * father's and mother's mobiles (named after the parent, or «Πατέρας»/«Μητέρα»
 * when the file leaves the name empty), «Τηλέφωνο (1)» (the guardian's when the
 * row names one, else «Τηλέφωνο οικίας»), then «τηλέφωνο SMS» («SMS»).
 */
export function importContactsFromRow(row: {
  fatherName: string;
  fatherPhone: string;
  motherName: string;
  motherPhone: string;
  guardianName: string;
  homePhone: string;
  smsPhone: string;
}): ImportedContact[] {
  const out: ImportedContact[] = [];
  const seen = new Set<string>();
  const add = (name: string, phone: string, role: ContactRole) => {
    const p = phone.trim();
    const norm = normalizePhone(p);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    out.push({ name: name.trim() || ROLE_NAME[role] || name, phone: p, role });
  };
  add(row.fatherName, row.fatherPhone, "FATHER");
  add(row.motherName, row.motherPhone, "MOTHER");
  if (row.guardianName.trim()) add(row.guardianName, row.homePhone, "GUARDIAN");
  else add(HOME_PHONE_NAME, row.homePhone, "OTHER");
  add(SMS_PLACEHOLDER_NAME, row.smsPhone, "OTHER");
  return out;
}

/** The numbers an exit-permit deputy can call and pick as "who agreed" — every
 *  contact on record. The import's «SMS» contact is folded into the parent with
 *  the same number (however formatted), who takes over its default flag and
 *  keeps the SMS number as `smsPhone`; an «SMS» number that matches nobody
 *  stays, listed last, with `smsPhone` its own. Active or not doesn't
 *  matter: "active" picks who receives SMS, not who the deputy may phone.
 *  Order: the default, then people, then the home phone and the SMS number. */
export function permitContactChoices<
  T extends { name: string; phone: string; role: string; isDefault: boolean },
>(contacts: T[]): (T & { smsPhone?: string })[] {
  const others = contacts.filter((c) => !isSmsPlaceholder(c));
  // Every separate number of every person, so an SMS number inside a two-number field still matches.
  const otherPhones = new Set(others.flatMap((c) => splitPhones(c.phone).map(normalizePhone)));
  const defaultSms = new Map(
    contacts
      .filter((c) => isSmsPlaceholder(c) && c.isDefault && normalizePhone(c.phone))
      .map((c) => [normalizePhone(c.phone), c.phone] as const)
  );
  const unmatchedSms = contacts
    .filter((c) => isSmsPlaceholder(c) && !otherPhones.has(normalizePhone(c.phone)))
    .map((c) => ({ ...c, smsPhone: c.phone }));
  // A parent whose field holds the SMS number among others still counts.
  const smsOf = (c: T) => splitPhones(c.phone).map(normalizePhone).find((n) => defaultSms.has(n));
  const rank = (c: T) => (c.isDefault ? 0 : isHomePhone(c) ? 2 : isSmsPlaceholder(c) ? 3 : 1);
  return [
    ...others.map((c) => {
      const sms = defaultSms.get(normalizePhone(c.phone)) ?? (smsOf(c) ? defaultSms.get(smsOf(c)!) : undefined);
      return sms ? { ...c, isDefault: true, smsPhone: sms } : c;
    }),
    ...unmatchedSms,
  ].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "el"));
}

/**
 * The separate numbers in one phone field: «99123456 / 22445566» → two. Splits
 * on / , ; | or " - ", and on spaces between two runs of 8+ digits; a number
 * written with inner spaces («99 12 34 56») stays one. Each kept as typed,
 * duplicates (compared normalised) dropped.
 */
export function splitPhones(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const pieces = raw
    .split(/[/,;|]| - /)
    .flatMap((p) => p.split(/(?<=\d{8,})\s+(?=\+?\d{8,})/))
    .map((p) => p.trim())
    .filter((p) => normalizePhone(p));
  const seen = new Set<string>();
  return pieces.filter((p) => {
    const n = normalizePhone(p);
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

/** Which of a row's numbers is the family's SMS number — the one to call first. */
export function preferredPhone(phones: string[], smsPhone: string | null | undefined): string | null {
  const target = normalizePhone(smsPhone);
  if (!target) return null;
  return phones.find((p) => normalizePhone(p) === target) ?? null;
}

/** A parent who signed up in the app, as the permit desk sees them. */
export interface ParentAccountPhone {
  id: string;
  name: string;
  phone: string | null;
  role: string;
}

/** The linked parents (StudentProfile.parents) as account phones; nameless ones get their role's name. */
export function parentAccountPhones(
  rows: { parentProfile: { id: string; phone: string | null; role: string; user: { name: string | null } | null } }[],
): ParentAccountPhone[] {
  return rows.map(({ parentProfile: p }) => ({
    id: p.id,
    name: p.user?.name?.trim() || ROLE_NAME[p.role] || p.role,
    phone: p.phone,
    role: p.role,
  }));
}

export interface PermitChoice {
  /** The radio value: an SmsContact id, or "account:<parentProfileId>". */
  value: string;
  kind: "contact" | "account";
  name: string;
  role: string;
  phone: string;
  isDefault: boolean;
  /** The family's SMS number, on the row that holds it. */
  smsPhone?: string;
}

export const ACCOUNT_CHOICE_PREFIX = "account:";

/**
 * Every phone the deputy can call: the imported contacts (permitContactChoices),
 * then the phones of linked parent accounts that aren't already listed — after
 * the people, before the home and SMS numbers. Accounts are never the default.
 */
export function permitPhoneChoices<
  T extends { id: string; name: string; phone: string; role: string; isDefault: boolean },
>(contacts: T[], accounts: ParentAccountPhone[]): PermitChoice[] {
  const imported = permitContactChoices(contacts).map(
    (c): PermitChoice => ({
      value: c.id,
      kind: "contact",
      name: c.name,
      role: c.role,
      phone: c.phone,
      isDefault: c.isDefault,
      ...(c.smsPhone ? { smsPhone: c.smsPhone } : {}),
    })
  );
  const listed = new Set(imported.flatMap((c) => splitPhones(c.phone).map(normalizePhone)));
  const extra: PermitChoice[] = [];
  for (const a of accounts) {
    const nums = splitPhones(a.phone).filter((p) => !listed.has(normalizePhone(p)));
    if (nums.length === 0) continue;
    nums.forEach((p) => listed.add(normalizePhone(p)));
    extra.push({ value: `${ACCOUNT_CHOICE_PREFIX}${a.id}`, kind: "account", name: a.name, role: a.role, phone: nums.join(" / "), isDefault: false });
  }
  const tail = imported.findIndex((c) => !c.isDefault && (isHomePhone(c) || isSmsPlaceholder(c)));
  const at = tail === -1 ? imported.length : tail;
  return [...imported.slice(0, at), ...extra, ...imported.slice(at)];
}

/**
 * What a re-import does with one student's contacts. The file wins: an
 * imported number already on record takes the file's name and role (so a
 * parent once saved as «SMS» or a bare «Πατέρας» gets their real name); a new
 * number is created. The file's «SMS» placeholder never overwrites a stored
 * person — the SMS number only marks which parent is preferred. Default and
 * active flags are not part of this; the default-recipient step decides them.
 */
export function planContactImport(
  existing: { id: string; name: string; phone: string; role: string }[],
  imported: ImportedContact[],
): { create: ImportedContact[]; update: { id: string; name: string; role: ContactRole }[] } {
  const byNumber = new Map<string, (typeof existing)[number]>();
  for (const e of existing) {
    for (const p of splitPhones(e.phone)) {
      const n = normalizePhone(p);
      if (!byNumber.has(n)) byNumber.set(n, e);
    }
  }
  const create: ImportedContact[] = [];
  const update: { id: string; name: string; role: ContactRole }[] = [];
  const touched = new Set<string>();
  for (const c of imported) {
    const match = splitPhones(c.phone).map((p) => byNumber.get(normalizePhone(p))).find(Boolean);
    if (!match) {
      create.push(c);
      continue;
    }
    if (touched.has(match.id)) continue;
    touched.add(match.id);
    if (isSmsPlaceholder(c) && !isSmsPlaceholder(match)) continue;
    // A row with the parent's name left empty gives just «Πατέρας»: there is no
    // name in the file to win with, so a real name on record stays.
    const fileHasName = c.name.trim() !== ROLE_NAME[c.role];
    const name = fileHasName || match.role !== c.role || isSmsPlaceholder(match) || isHomePhone(match) ? c.name : match.name;
    if (match.name.trim() !== name.trim() || match.role !== c.role) {
      update.push({ id: match.id, name, role: c.role });
    }
  }
  return { create, update };
}

export interface ParentCardRow {
  id: string;
  name: string;
  role: string;
  /** Every number, with the family's SMS number marked preferred. */
  phones: { phone: string; preferred: boolean }[];
}

/**
 * The student page's «Γονείς / Κηδεμόνες»: the parents and guardians as people
 * (name, role, phones). The SMS number is not a person — it only marks which
 * parent's phone is preferred; when it matches nobody it is reported apart, as
 * is the household number («Τηλέφωνο οικίας»).
 */
export function parentCard<T extends { id: string; name: string; phone: string; role: string; isDefault: boolean }>(
  contacts: T[],
): { parents: ParentCardRow[]; homePhones: { phone: string; preferred: boolean }[]; unmatchedSms: string | null } {
  const folded = permitContactChoices(contacts);
  const markPreferred = (c: (typeof folded)[number]) => {
    const phones = splitPhones(c.phone);
    const preferred = c.isDefault ? preferredPhone(phones, c.smsPhone) ?? phones[0] ?? null : null;
    return phones.map((phone) => ({ phone, preferred: phone === preferred }));
  };
  const isParent = (c: { role: string }) => c.role === "FATHER" || c.role === "MOTHER" || c.role === "GUARDIAN";
  const order: Record<string, number> = { FATHER: 0, MOTHER: 1, GUARDIAN: 2 };
  const parents = folded
    .filter((c) => isParent(c) && !isSmsPlaceholder(c))
    .sort((a, b) => order[a.role]! - order[b.role]! || a.name.localeCompare(b.name, "el"))
    .map((c) => ({ id: c.id, name: c.name, role: c.role, phones: markPreferred(c) }));
  // The household number can be the family's SMS number too.
  const homePhones = folded.filter((c) => isHomePhone(c)).flatMap(markPreferred);
  const sms = folded.find((c) => isSmsPlaceholder(c));
  return { parents, homePhones, unmatchedSms: sms ? sms.phone : null };
}
