// «Ωράριο περιόδων» — the bell schedule: when each period starts and ends.
// Two schedules, the 7-period day (Πρόγραμμα Α΄, Επτάωρο) and the 8-period
// day (Πρόγραμμα Γ΄, Οκτάωρο), plus which one each weekday follows. Breaks are
// not stored: they are the gaps between consecutive periods.
// Pure (no DB) so the rules are unit-tested; read with getBellSchedule().

import type { PeriodsPerDay } from "@/lib/periods";

export const BELL_SCHEDULE_KEY = "bellSchedule";

export type BellScheduleId = "seven" | "eight";
export const BELL_SCHEDULE_IDS: BellScheduleId[] = ["seven", "eight"];
/** How many periods each schedule has. */
export const BELL_PERIOD_COUNT: Record<BellScheduleId, number> = { seven: 7, eight: 8 };

export interface BellPeriod {
  /** "HH:MM", 24-hour. */
  start: string;
  end: string;
}

export interface BellScheduleConfig {
  schedules: Record<BellScheduleId, BellPeriod[]>;
  /** Weekday 1–5 → the schedule it follows. */
  days: Record<number, BellScheduleId>;
}

const p = (start: string, end: string): BellPeriod => ({ start, end });

/** The school's printed bell schedule (2026–27). */
export const DEFAULT_BELL_SCHEDULE: BellScheduleConfig = {
  schedules: {
    seven: [
      p("07:40", "08:25"), p("08:25", "09:10"),
      p("09:30", "10:15"), p("10:15", "11:00"),
      p("11:15", "12:00"), p("12:00", "12:45"),
      p("12:55", "13:35"),
    ],
    eight: [
      p("07:40", "08:20"), p("08:20", "09:00"),
      p("09:15", "09:55"), p("09:55", "10:35"),
      p("10:50", "11:30"), p("11:30", "12:10"),
      p("12:15", "12:55"), p("12:55", "13:35"),
    ],
  },
  days: { 1: "eight", 2: "seven", 3: "seven", 4: "eight", 5: "seven" },
};

/** "7.40", "07:40", "0740" → "07:40"; null when it is not a valid time. */
export function normalizeTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h! * 60 + m!;
}

export type BellProblem =
  | { kind: "badTime"; schedule: BellScheduleId; period: number }
  | { kind: "endBeforeStart"; schedule: BellScheduleId; period: number }
  | { kind: "overlap"; schedule: BellScheduleId; period: number };

/** The first problem per period, in order; empty when the schedule can be saved. */
export function bellProblems(config: BellScheduleConfig): BellProblem[] {
  const out: BellProblem[] = [];
  for (const id of BELL_SCHEDULE_IDS) {
    const periods = config.schedules[id];
    periods.forEach((per, i) => {
      const period = i + 1;
      const start = normalizeTime(per.start);
      const end = normalizeTime(per.end);
      if (!start || !end) return void out.push({ kind: "badTime", schedule: id, period });
      if (toMinutes(end) <= toMinutes(start)) return void out.push({ kind: "endBeforeStart", schedule: id, period });
      const prevEnd = i > 0 ? normalizeTime(periods[i - 1]!.end) : null;
      if (prevEnd && toMinutes(start) < toMinutes(prevEnd)) out.push({ kind: "overlap", schedule: id, period });
    });
  }
  return out;
}

/** The breaks of a schedule: after which period, and how many minutes. */
export function breaksOf(periods: BellPeriod[]): { afterPeriod: number; minutes: number }[] {
  const out: { afterPeriod: number; minutes: number }[] = [];
  for (let i = 1; i < periods.length; i++) {
    const prevEnd = normalizeTime(periods[i - 1]!.end);
    const start = normalizeTime(periods[i]!.start);
    if (!prevEnd || !start) continue;
    const gap = toMinutes(start) - toMinutes(prevEnd);
    if (gap > 0) out.push({ afterPeriod: i, minutes: gap });
  }
  return out;
}

/** Weekdays whose schedule has a different number of periods than «Περίοδοι ανά ημέρα». */
export function dayMismatches(config: BellScheduleConfig, periodsPerDay: PeriodsPerDay): number[] {
  return [1, 2, 3, 4, 5].filter(
    (dow) => BELL_PERIOD_COUNT[config.days[dow] ?? "seven"] !== (periodsPerDay[dow] ?? 7),
  );
}

function isPeriodList(v: unknown, count: number): v is BellPeriod[] {
  return (
    Array.isArray(v) &&
    v.length === count &&
    v.every((x) => x && typeof x.start === "string" && typeof x.end === "string")
  );
}

/** The stored setting, or the defaults for anything missing or malformed. */
export function parseBellSchedule(raw: string | null | undefined): BellScheduleConfig {
  if (!raw) return DEFAULT_BELL_SCHEDULE;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_BELL_SCHEDULE;
  }
  const d = (data ?? {}) as Partial<BellScheduleConfig>;
  const schedules = { ...DEFAULT_BELL_SCHEDULE.schedules };
  for (const id of BELL_SCHEDULE_IDS) {
    const list = d.schedules?.[id];
    if (isPeriodList(list, BELL_PERIOD_COUNT[id])) schedules[id] = list.map((x) => ({ start: x.start, end: x.end }));
  }
  const days = { ...DEFAULT_BELL_SCHEDULE.days };
  for (const dow of [1, 2, 3, 4, 5]) {
    const v = d.days?.[dow];
    if (v === "seven" || v === "eight") days[dow] = v;
  }
  return { schedules, days };
}

/** Normalise every time before saving ("7.40" → "07:40"). Call only when bellProblems() is empty. */
export function normalizeBellSchedule(config: BellScheduleConfig): BellScheduleConfig {
  const norm = (per: BellPeriod) => ({ start: normalizeTime(per.start)!, end: normalizeTime(per.end)! });
  return {
    schedules: { seven: config.schedules.seven.map(norm), eight: config.schedules.eight.map(norm) },
    days: { ...config.days },
  };
}

/**
 * Start and end of the period shown on `row` of weekday `dow` (1–5). A day with
 * an inserted homegroup period (Εμβόλιμη) follows the 8-period times; a row
 * past the schedule's last period, or a weekend, has none.
 */
export function periodTime(
  config: BellScheduleConfig,
  dow: number,
  row: number,
  meeting?: { mode: "insert" | "replace" } | null,
): BellPeriod | null {
  if (dow < 1 || dow > 5) return null;
  const id: BellScheduleId = meeting?.mode === "insert" ? "eight" : (config.days[dow] ?? "seven");
  const per = config.schedules[id][row - 1];
  return per ? { start: per.start, end: per.end } : null;
}
