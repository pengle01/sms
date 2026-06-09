import { utcMidnight } from "@/lib/dates";

// Weekly occurrences on the same weekday, from start to `until` (inclusive).
// A missing/earlier `until` yields just the single start date. Used by the
// repeating-activity option when constructing an activity.
export function weeklyOccurrences(startIso: string, untilIso: string | null): string[] {
  const start = utcMidnight(startIso);
  if (!untilIso) return [startIso];
  const until = utcMidnight(untilIso);
  if (until <= start) return [startIso];
  const dates: string[] = [];
  for (let d = new Date(start); d <= until; d = new Date(d.getTime() + 7 * 86400000)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
