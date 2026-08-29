// How long ago something happened, as a unit + count for the caller to phrase.
// No i18n here — unit-tested in src/test/unit/relativeTime.test.ts.

export type RelativeTime =
  | { unit: "now" }
  | { unit: "minutes" | "hours" | "days"; value: number };

/**
 * Coarse "time ago" for notification timestamps.
 *
 * Returns the unit rather than a sentence: the two places that show this were
 * each carrying their own Greek strings, and had drifted into saying it
 * differently ("πριν 5 λεπτ." vs "5 λεπτ. πριν"). The caller turns this into
 * words through next-intl, so the phrasing lives once, per language.
 *
 * Anything a day or more old is reported in days without rolling up to weeks —
 * the notification lists are short-lived and a precise day count reads better
 * than "last month".
 */
export function relativeTime(date: Date | string, now: number = Date.now()): RelativeTime {
  const d = typeof date === "string" ? new Date(date) : date;
  const mins = Math.floor((now - d.getTime()) / 60_000);
  // A clock skew between server and browser can put "now" slightly in the
  // future; that is still "just now", never a negative count.
  if (mins < 1) return { unit: "now" };
  if (mins < 60) return { unit: "minutes", value: mins };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { unit: "hours", value: hours };
  return { unit: "days", value: Math.floor(hours / 24) };
}
