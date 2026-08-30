// Automatic SMS to parents for a first-period absence.
//
// The school turns it on, writes the wording, and sets a time after which
// nothing goes out — a message telling a parent their child is absent is only
// useful early; sent at noon it is noise, and sent on a register filled in days
// later it is simply wrong. Pure helpers only — no DB, and `now` is always a
// parameter so the rule can be tested without freezing a clock.

// A `type` (not `interface`) so it gets an implicit index signature and stays
// assignable to Prisma's JSON input types (audit details, GlobalSetting).
export type AbsenceSmsConfig = {
  enabled: boolean;
  /** "HH:MM", server-local wall clock. */
  cutoff: string;
  template: string;
};

export const ABSENCE_SMS_KEY = "absence_sms";

/** Longest a template may be; the gateway itself refuses past 3 segments. */
export const ABSENCE_SMS_TEMPLATE_MAX = 300;

export const DEFAULT_ABSENCE_SMS: AbsenceSmsConfig = {
  // Off until the school switches it on: nobody should discover this feature by
  // having it text every parent.
  enabled: false,
  cutoff: "09:30",
  // No school name — the gateway's sender ID already shows it, and every
  // character here costs, since Greek text fits only 70 to a message.
  template: "Απουσία 1ης περ.: {όνομα} {ημερομηνία}",
};

/** Strict "HH:MM" on a 24-hour clock. */
export function isValidCutoff(hhmm: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

/** Parse the stored GlobalSetting JSON, tolerating anything malformed. */
export function parseAbsenceSms(value: string | null | undefined): AbsenceSmsConfig {
  if (!value) return { ...DEFAULT_ABSENCE_SMS };
  try {
    const o = JSON.parse(value) as Partial<AbsenceSmsConfig>;
    const cutoff =
      typeof o?.cutoff === "string" && isValidCutoff(o.cutoff)
        ? o.cutoff
        : DEFAULT_ABSENCE_SMS.cutoff;
    const template =
      typeof o?.template === "string" && o.template.trim()
        ? o.template.trim().slice(0, ABSENCE_SMS_TEMPLATE_MAX)
        : DEFAULT_ABSENCE_SMS.template;
    return { enabled: o?.enabled === true, cutoff, template };
  } catch {
    return { ...DEFAULT_ABSENCE_SMS };
  }
}

/**
 * Is the wall clock past the cutoff?
 *
 * The boundary is inclusive: at exactly the cutoff the message still goes. A
 * teacher saving the register as the deadline strikes should not lose it to a
 * race with the clock.
 */
export function isPastCutoff(now: Date, cutoff: string): boolean {
  if (!isValidCutoff(cutoff)) return false; // a broken setting must not silence the feature
  const [h, m] = cutoff.split(":").map(Number) as [number, number];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes > h * 60 + m;
}

/**
 * Fill the admin's template. Both spellings of each placeholder are accepted —
 * the settings page is bilingual, and a Greek secretary should not have to type
 * English tokens to make it work.
 */
export function renderAbsenceSms(
  template: string,
  values: { name: string; date: string },
): string {
  return template
    .replace(/\{(όνομα|ονομα|name)\}/gi, values.name)
    .replace(/\{(ημερομηνία|ημερομηνια|date)\}/gi, values.date);
}

/**
 * The whole decision, in one place, so the router stays thin and the rule is
 * tested rather than inspected.
 */
export function shouldSendAbsenceSms(a: {
  config: AbsenceSmsConfig;
  /** The attendance row's date, YYYY-MM-DD. */
  attendanceDateIso: string;
  /** Today, YYYY-MM-DD, in the same local frame as `now`. */
  todayIso: string;
  now: Date;
  status: string;
  alreadySent: boolean;
}): boolean {
  if (!a.config.enabled) return false;
  if (a.status !== "ABSENT") return false;
  if (a.alreadySent) return false;
  // Never text about an old register: "your child is absent" must mean today.
  if (a.attendanceDateIso !== a.todayIso) return false;
  if (isPastCutoff(a.now, a.config.cutoff)) return false;
  return true;
}
