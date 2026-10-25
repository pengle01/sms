// Greek display labels for referral enums — shared by client + server.

export const RECOMMENDATION_LABEL: Record<string, string> = {
  NO_RECOMMENDATION: "Καμία εισήγηση",
  EXPULSION: "Αποβολή",
  STRICT_MEASURE: "Αυστηρό παιδαγωγικό μέτρο",
  OBSERVATION: "Παρατήρηση",
  STRICT_OBSERVATION: "Αυστηρή παρατήρηση",
  NOTIFY_PARENTS: "Ενημέρωση γονέων",
  OTHER_RECOMMENDATION: "Άλλη εισήγηση",
};

export function recommendationLabel(value: string): string {
  return RECOMMENDATION_LABEL[value] ?? value;
}

/**
 * A referral's recommendations: the list (several may be ticked), or — for a
 * referral filed before that — its single legacy value. «Καμία εισήγηση» and an
 * empty list both mean none.
 */
export function referralRecommendations(r: {
  recommendations?: readonly string[] | null;
  recommendation?: string | null;
}): string[] {
  if (r.recommendations && r.recommendations.length > 0) return [...r.recommendations];
  return r.recommendation && r.recommendation !== "NO_RECOMMENDATION" ? [r.recommendation] : [];
}

/** "Αυστηρή παρατήρηση · Ενημέρωση γονέων" — empty string for none. */
export function recommendationsLabel(values: readonly string[]): string {
  return values.map(recommendationLabel).join(" · ");
}

export const ACTION_LABEL: Record<string, string> = {
  DETENTION: "Αποβολή",
  PEDAGOGICAL_DIALOGUE: "Παιδαγωγικός Διάλογος",
  WRITTEN_AGREEMENT: "Γραπτή Συμφωνία",
  WARNING: "Προειδοποίηση",
  SUSPENDED_EXPULSION: "Αποβολή με Αναστολή",
  OTHER: "Άλλο",
};

/** The punishments in the order the resolve dialog offers them. */
export const ACTION_ORDER = [
  "PEDAGOGICAL_DIALOGUE",
  "WARNING",
  "WRITTEN_AGREEMENT",
  "SUSPENDED_EXPULSION",
  "DETENTION",
  "OTHER",
] as const;
export type ResolutionActionValue = (typeof ACTION_ORDER)[number];

export function actionLabel(value: string): string {
  return ACTION_LABEL[value] ?? value;
}

const daysWord = (n: number) => `${n} ημέρ${n === 1 ? "α" : "ες"}`;
const periodsWord = (n: number) => `${n} περίοδο${n === 1 ? "ς" : "ι"}`;

/** «2 ημέρες», «3 περίοδοι», «1 ημέρα + 3 περίοδοι»; empty when nothing. */
export function lengthLabel(days: number, periods: number): string {
  return [days > 0 ? daysWord(days) : null, periods > 0 ? periodsWord(periods) : null].filter(Boolean).join(" + ");
}

/**
 * The length of an expulsion: whole days counted as days, period ranges as
 * periods (their size).
 */
export function expulsionLength(days: readonly { fromPeriod?: number | null; toPeriod?: number | null }[]): {
  days: number;
  periods: number;
} {
  let whole = 0;
  let periods = 0;
  for (const d of days) {
    if (d.fromPeriod != null && d.toPeriod != null) periods += Math.max(0, d.toPeriod - d.fromPeriod + 1);
    else whole += 1;
  }
  return { days: whole, periods };
}

/**
 * Compact one-line summary of a resolved punishment, e.g. «Αποβολή · 2 ημέρες»,
 * «Αποβολή · 1 ημέρα + 3 περίοδοι», «Αποβολή με Αναστολή · 2 ημέρες» or
 * «Προειδοποίηση». Details/notes are shown separately.
 */
export function resolutionSummary(resolution: {
  action: string;
  expulsionDays?: { date: Date; fromPeriod?: number | null; toPeriod?: number | null }[] | null;
  suspendedDays?: number | null;
  suspendedPeriods?: number | null;
}): string {
  const base = actionLabel(resolution.action);
  const length =
    resolution.action === "SUSPENDED_EXPULSION"
      ? lengthLabel(resolution.suspendedDays ?? 0, resolution.suspendedPeriods ?? 0)
      : (() => {
          const l = expulsionLength(resolution.expulsionDays ?? []);
          return lengthLabel(l.days, l.periods);
        })();
  return length ? `${base} · ${length}` : base;
}

/** «16/03/26» for a whole day, «16/03/26 · Π3–Π5» for part of one. */
export function expulsionDayLabel(
  d: { date: Date; fromPeriod?: number | null; toPeriod?: number | null },
  fmt: (date: Date) => string,
): string {
  return d.fromPeriod != null && d.toPeriod != null ? `${fmt(d.date)} · Π${d.fromPeriod}–Π${d.toPeriod}` : fmt(d.date);
}

export const COMPACT_DESCRIPTION_CHARS = 90;

/**
 * What the compact referral list shows as the referral's title: its title, or
 * — for one filed without a title — the start of its description, on one line.
 */
export function compactReferralTitle(r: { title: string | null; description: string }): { text: string; fromTitle: boolean } {
  const title = r.title?.trim();
  if (title) return { text: title, fromTitle: true };
  const desc = r.description.replace(/\s+/g, " ").trim();
  if (!desc) return { text: "—", fromTitle: false };
  return {
    text: desc.length > COMPACT_DESCRIPTION_CHARS ? `${desc.slice(0, COMPACT_DESCRIPTION_CHARS - 1).trimEnd()}…` : desc,
    fromTitle: false,
  };
}
