"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { shiftSchoolDay, type DutyDayMode } from "@/lib/dutyDay";

/**
 * «Εφημερίες»: the day every tab shows. Moving to another day keeps the open
 * tab (`view`) and the permit search, and drops the desk's own state.
 */
export function DutyDayBar({
  dayIso,
  todayIso,
  mode,
  dayLabel,
}: {
  dayIso: string;
  todayIso: string;
  mode: DutyDayMode;
  /** «Τρι 20/10/26» */
  dayLabel: string;
}) {
  const t = useTranslations("duty");
  const router = useRouter();

  const go = (iso: string) => {
    const sp = new URLSearchParams(window.location.search);
    for (const k of ["student", "error", "bdDate", "planDate"]) sp.delete(k);
    if (iso === todayIso) sp.delete("day");
    else sp.set("day", iso);
    const qs = sp.toString();
    router.push(qs ? `?${qs}` : "?");
  };

  const nav = "inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2",
        mode === "today" ? "border-slate-200 bg-white" : "border-amber-300 bg-amber-50",
      )}
    >
      <button type="button" onClick={() => go(shiftSchoolDay(dayIso, -1))} aria-label={t("prevDay")} className={nav}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      <DateInput
        key={dayIso}
        id="duty-day"
        defaultValue={dayIso}
        onCommit={(iso) => iso && iso !== dayIso && go(iso)}
        className="h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white"
      />
      <button type="button" onClick={() => go(shiftSchoolDay(dayIso, 1))} aria-label={t("nextDay")} className={nav}>
        <ChevronRight className="w-4 h-4" />
      </button>
      {mode === "today" ? (
        <span className="text-sm font-medium text-emerald-700">{t("viewingToday")}</span>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800">
            <History className="w-4 h-4" />
            {mode === "past" ? t("viewingPast", { date: dayLabel }) : t("viewingFuture", { date: dayLabel })}
          </span>
          <button
            type="button"
            onClick={() => go(todayIso)}
            className="ml-auto h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            {t("backToToday")}
          </button>
        </>
      )}
    </div>
  );
}
