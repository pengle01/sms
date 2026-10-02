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
  OTHER: "Άλλο",
};

export function actionLabel(value: string): string {
  return ACTION_LABEL[value] ?? value;
}

/**
 * Compact one-line summary of a resolved punishment, e.g.
 * "Αποβολή · 2 ημέρες" or "Προειδοποίηση". Details/notes are shown separately.
 */
export function resolutionSummary(resolution: {
  action: string;
  expulsionDays?: { date: Date }[] | null;
}): string {
  const base = actionLabel(resolution.action);
  const days = resolution.expulsionDays?.length ?? 0;
  return days > 0 ? `${base} · ${days} ημέρ${days === 1 ? "α" : "ες"}` : base;
}
