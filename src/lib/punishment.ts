// The length of a referral punishment, checked before it is saved:
//  • «Αποβολή» (DETENTION): dated days, each the whole day or a period range;
//  • «Αποβολή με Αναστολή» (SUSPENDED_EXPULSION): a length in days and/or
//    periods, no dates — served only if the student re-offends.
// Pure; unit-tested in punishment.test.ts.

import { validExpulsionDay, type PeriodsPerDay } from "@/lib/periods";

export const SUSPENDED_MAX_DAYS = 30;
export const SUSPENDED_MAX_PERIODS = 60;

export interface ExpulsionDayPayload {
  /** "YYYY-MM-DD" */
  date: string;
  fromPeriod?: number | null;
  toPeriod?: number | null;
}

export type PunishmentError =
  | "noDays"
  | "pastDay"
  | "weekend"
  | "duplicateDay"
  | "badRange"
  | "noSuspendedLength"
  | "badSuspended";

export const PUNISHMENT_ERROR_EL: Record<PunishmentError, string> = {
  noDays: "Επιλέξτε τουλάχιστον μία ημέρα αποβολής",
  pastDay: "Οι ημέρες αποβολής δεν μπορούν να είναι στο παρελθόν",
  weekend: "Οι ημέρες αποβολής πρέπει να είναι εργάσιμες",
  duplicateDay: "Η ίδια ημέρα επιλέχθηκε δύο φορές",
  badRange: "Μη έγκυρο εύρος περιόδων για την ημέρα",
  noSuspendedLength: "Δώστε τη διάρκεια της αποβολής με αναστολή (ημέρες ή περιόδους)",
  badSuspended: `Η διάρκεια πρέπει να είναι έως ${SUSPENDED_MAX_DAYS} ημέρες και ${SUSPENDED_MAX_PERIODS} περίοδοι`,
};

const dowOf = (iso: string) => new Date(`${iso}T12:00:00`).getDay();

/** Why this punishment's length can't be saved, or null when it can. */
export function validatePunishment(
  input: {
    action: string;
    expulsionDays?: ExpulsionDayPayload[] | null;
    suspendedDays?: number | null;
    suspendedPeriods?: number | null;
  },
  periodsPerDay: PeriodsPerDay,
  todayIso: string,
): PunishmentError | null {
  if (input.action === "DETENTION") {
    const days = input.expulsionDays ?? [];
    if (days.length === 0) return "noDays";
    if (new Set(days.map((d) => d.date)).size !== days.length) return "duplicateDay";
    for (const d of days) {
      if (d.date < todayIso) return "pastDay";
      const dow = dowOf(d.date);
      if (dow < 1 || dow > 5) return "weekend";
      if (!validExpulsionDay(d, periodsPerDay[dow] ?? 7)) return "badRange";
    }
    return null;
  }
  if (input.action === "SUSPENDED_EXPULSION") {
    const days = input.suspendedDays ?? 0;
    const periods = input.suspendedPeriods ?? 0;
    if (!Number.isInteger(days) || !Number.isInteger(periods) || days < 0 || periods < 0) return "badSuspended";
    if (days === 0 && periods === 0) return "noSuspendedLength";
    if (days > SUSPENDED_MAX_DAYS || periods > SUSPENDED_MAX_PERIODS) return "badSuspended";
    return null;
  }
  return null;
}
