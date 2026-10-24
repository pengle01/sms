import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, List } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarDay } from "@/lib/testCalendar";

export interface CalendarEntry {
  id: string;
  /** The subject. */
  title: string;
  /** The group, or the group and the teacher. */
  sub?: string;
  /** "P3" or "P3–4". */
  period: string;
  type: "BIG" | "SMALL";
  /** «Δικό μου» (the viewer's own test) or «μερικοί» (only some of a group sit it). */
  tag?: { label: string; tone: "mine" | "partial" };
  href?: string;
}

/**
 * A month of school days (Mon–Fri) with each day's tests: subject, period,
 * group. Big and small tests look different (dark and filled vs light with a
 * dashed border) and each says which it is; a legend above explains them.
 * Today is ringed; holidays shaded.
 */
export function TestsCalendar({
  weeks,
  monthLabel,
  prevHref,
  nextHref,
  todayIso,
  closed,
  entries,
  dayNames,
  labels,
}: {
  weeks: CalendarDay[][];
  monthLabel: string;
  prevHref: string;
  nextHref: string;
  todayIso: string;
  closed: Set<string>;
  entries: Map<string, CalendarEntry[]>;
  /** Monday … Friday. */
  dayNames: string[];
  labels: { prev: string; next: string; holiday: string; big: string; small: string };
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Link href={prevHref} aria-label={labels.prev} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <h3 className="text-base font-semibold text-slate-900 capitalize">{monthLabel}</h3>
        <Link href={nextHref} aria-label={labels.next} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700">
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-6 rounded bg-slate-800" />
          {labels.big}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-6 rounded border border-dashed border-slate-400 bg-white" />
          {labels.small}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-5 gap-px rounded-xl border border-slate-200 bg-slate-200 overflow-hidden min-w-[640px]">
          {dayNames.map((d) => (
            <div key={d} className="bg-slate-50 px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
              {d}
            </div>
          ))}
          {weeks.flat().map((day) => {
            const list = entries.get(day.iso) ?? [];
            const isClosed = closed.has(day.iso);
            return (
              <div
                key={day.iso}
                className={cn(
                  "min-h-24 p-1.5 space-y-1",
                  !day.inMonth ? "bg-slate-50/60" : isClosed ? "bg-slate-100" : "bg-white",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      day.iso === todayIso ? "bg-emerald-600 text-white font-bold" : day.inMonth ? "text-slate-700" : "text-slate-300",
                    )}
                  >
                    {day.date.getUTCDate()}
                  </span>
                  {isClosed && day.inMonth && <span className="text-[10px] text-slate-400">{labels.holiday}</span>}
                </div>
                {list.map((e) => {
                  const body = (
                    <div
                      className={cn(
                        "rounded-md px-1.5 py-1 text-[11px] leading-tight border",
                        e.type === "BIG"
                          ? "bg-slate-800 text-white border-slate-800"
                          : "bg-white text-slate-700 border-dashed border-slate-400",
                        e.tag?.tone === "mine" && "ring-2 ring-emerald-400",
                      )}
                      title={`${e.title}${e.sub ? ` · ${e.sub}` : ""} · ${e.period} · ${e.type === "BIG" ? labels.big : labels.small}`}
                    >
                      <p className="flex items-center justify-between gap-1">
                        <span className="opacity-70">{e.period}</span>
                        <span
                          className={cn(
                            "rounded px-1 text-[9px] font-bold uppercase tracking-wide",
                            e.type === "BIG" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {e.type === "BIG" ? labels.big : labels.small}
                        </span>
                      </p>
                      <p className="font-semibold truncate">{e.title}</p>
                      {e.sub && <p className="truncate opacity-80">{e.sub}</p>}
                      {e.tag && (
                        <p className={cn("font-semibold", e.tag.tone === "mine" ? "text-emerald-300" : "text-amber-500")}>
                          {e.tag.label}
                        </p>
                      )}
                    </div>
                  );
                  return e.href ? <Link key={e.id} href={e.href} className="block hover:opacity-90">{body}</Link> : <div key={e.id}>{body}</div>;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** «Λίστα» | «Ημερολόγιο» — the two ways to see the same tests. */
export function TestsViewToggle({
  view,
  listHref,
  calendarHref,
  labels,
}: {
  view: "list" | "calendar";
  listHref: string;
  calendarHref: string;
  labels: { list: string; calendar: string };
}) {
  const btn = (active: boolean) =>
    cn(
      "h-9 px-3 inline-flex items-center gap-1.5 text-sm font-medium transition-colors",
      active ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:text-emerald-700",
    );
  return (
    <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
      <Link href={listHref} className={btn(view === "list")}>
        <List className="w-4 h-4" />
        {labels.list}
      </Link>
      <Link href={calendarHref} className={cn(btn(view === "calendar"), "border-l border-slate-200")}>
        <CalendarDays className="w-4 h-4" />
        {labels.calendar}
      </Link>
    </div>
  );
}
