"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { scheduleTest, type TestConflict, type ScheduleTestError } from "../actions";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Assignment } from "./page";
import { getNow, fmtDisplayDate } from "@/lib/dates";

type SpecialDayInfo = { type: string; start: string; end: string; eventStartPeriod?: number | null; eventEndPeriod?: number | null };

function getDateSpecialDay(dateStr: string, specialDays: SpecialDayInfo[]): SpecialDayInfo | null {
  return specialDays.find((d) => dateStr >= d.start && dateStr <= d.end) ?? null;
}

const HOLIDAY_TYPES = new Set(["BANK_HOLIDAY", "CHRISTMAS", "EASTER", "OTHER_HOLIDAY"]);

type DateBadge = {
  key: "holiday" | "excursion" | "schoolEvent" | "intercalary";
  periods?: { from: number; to: number };
  style: string;
};

/** Returns the message key rather than the text — this runs outside the component. */
function dateBadge(day: SpecialDayInfo | null): DateBadge | null {
  if (!day) return null;
  if (HOLIDAY_TYPES.has(day.type)) return { key: "holiday", style: "text-red-600" };
  if (day.type === "EXCURSION")    return { key: "excursion", style: "text-blue-600" };
  if (day.type === "SCHOOL_EVENT") {
    const { eventStartPeriod: from, eventEndPeriod: to } = day;
    return {
      key: "schoolEvent",
      ...(from != null && to != null ? { periods: { from, to } } : {}),
      style: "text-amber-600",
    };
  }
  if (day.type === "INTERCALARY")  return { key: "intercalary", style: "text-purple-600" };
  return null;
}

// dayOfWeek: 1=Mon…5=Fri matches Date.getDay() 1=Mon…5=Fri
function getUpcomingDates(dayOfWeek: number, count = 12): string[] {
  const dates: string[] = [];
  const today = getNow();
  today.setHours(0, 0, 0, 0);
  for (let offset = 0; dates.length < count; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    if (d.getDay() === dayOfWeek) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${day}`);
    }
  }
  return dates;
}

function formatDateLabel(dateStr: string) {
  return fmtDisplayDate(dateStr + "T00:00:00.000Z");
}

interface Props {
  assignments: Assignment[];
  locale: string;
  specialDays: SpecialDayInfo[];
}

export function TestForm({ assignments, locale, specialDays }: Props) {
  const t = useTranslations("tests");
  const tc = useTranslations("common");
  const tCal = useTranslations("calendar");
  // Listed one by one rather than built from a template key, so a missing
  // translation is a type error instead of a runtime one.
  const dayName = ["", tc("dow1"), tc("dow2"), tc("dow3"), tc("dow4"), tc("dow5")];
  const dayShort = ["", tc("dowShort1"), tc("dowShort2"), tc("dowShort3"), tc("dowShort4"), tc("dowShort5")];
  const periodLabel = (period: number) => tc("periodShort", { period });
  const periodSpan = (period: number, count: number) =>
    count > 1 ? tc("periodRange", { from: period, to: period + count - 1 }) : periodLabel(period);
  // Tests only ever fall on a school day, so 0/6 never carry a weekday label.
  const testDate = (iso: string) => {
    const dow = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
    const day = dow >= 1 && dow <= 5 ? `${dayShort[dow]} ` : "";
    return `${day}${fmtDisplayDate(`${iso}T00:00:00.000Z`)}`;
  };
  const badgeLabel = (b: DateBadge) =>
    b.periods
      ? `${tCal(b.key)} ${b.periods.from === b.periods.to
          ? periodLabel(b.periods.from)
          : tc("periodRange", { from: b.periods.from, to: b.periods.to })}`
      : tCal(b.key);

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ key: ScheduleTestError; period?: number } | null>(null);
  const [conflicts, setConflicts] = useState<TestConflict[] | null>(null);

  const [assignmentIdx, setAssignmentIdx] = useState(0);
  const [slotIdx, setSlotIdx] = useState(0);
  const [date, setDate] = useState("");
  const [type, setType] = useState<"SMALL" | "BIG">("BIG");
  const [periodCount, setPeriodCount] = useState(1);

  const assignment = assignments[assignmentIdx]!;
  const slot = assignment.slots[slotIdx]!;

  // 2-period big test requires a consecutive slot on the same day
  const hasConsecutiveSlot = assignment.slots.some(
    (s) => s.dayOfWeek === slot.dayOfWeek && s.period === slot.period + 1
  );

  const upcomingDates = useMemo(
    () => getUpcomingDates(slot.dayOfWeek, 12),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slot.dayOfWeek]
  );

  // Same sentence for the disabled button's tooltip and the note beneath it.
  const unavailableHint = t("duration2Disabled", { period: periodLabel(slot.period + 1) });

  const reset = () => { setConflicts(null); setError(null); };

  const handleAssignmentChange = (idx: number) => {
    setAssignmentIdx(idx);
    setSlotIdx(0);
    setDate("");
    reset();
  };

  const handleSlotChange = (idx: number) => {
    setSlotIdx(idx);
    setDate("");
    setPeriodCount(1);
    reset();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;
    reset();

    startTransition(async () => {
      const result = await scheduleTest({
        groupId: assignment.groupId,
        courseId: assignment.courseId,
        date,
        period: slot.period,
        periodCount: type === "BIG" ? periodCount : 1,
        type,
      });

      if (result.success) {
        router.push(`/${locale}/teacher/tests`);
      } else if ("conflicts" in result) {
        setConflicts(result.conflicts);
      } else {
        setError({ key: result.error, period: result.period });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Group + Course */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">{t("fieldClassSubject")}</label>
        <select
          value={assignmentIdx}
          onChange={(e) => handleAssignmentChange(parseInt(e.target.value))}
          className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          {assignments.map((a, i) => (
            <option key={`${a.groupId}-${a.courseId}`} value={i}>
              {a.groupName} — {a.courseName}
            </option>
          ))}
        </select>
      </div>

      {/* Slot (day + period) */}
      {assignment.slots.length > 1 && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">{t("fieldLessonSlot")}</label>
          <div className="flex flex-wrap gap-2">
            {assignment.slots.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSlotChange(i)}
                className={`h-9 px-4 rounded-lg text-sm font-medium border transition-colors ${
                  slotIdx === i
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800"
                }`}
              >
                {dayName[s.dayOfWeek]} · {periodLabel(s.period)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Date — upcoming occurrences of this lesson's day */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">
          {t("fieldDate")}
          <span className="ml-1.5 text-slate-400 font-normal text-xs">
            {t("dateHint", { day: dayName[slot.dayOfWeek]!, period: periodLabel(slot.period) })}
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          {upcomingDates.map((d) => {
            const specialDay = getDateSpecialDay(d, specialDays);
            const badge = dateBadge(specialDay);
            const isDisabled = !!specialDay;
            const isSelected = date === d;
            return (
              <button
                key={d}
                type="button"
                disabled={isDisabled}
                onClick={() => { setDate(d); reset(); }}
                className={`relative flex flex-col items-center min-w-[80px] px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  isSelected
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : isDisabled
                    ? "cursor-not-allowed opacity-60 bg-slate-50 border-slate-200"
                    : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
                }`}
              >
                <span className={isDisabled && !isSelected ? "text-slate-400 line-through" : ""}>{formatDateLabel(d)}</span>
                {badge && !isSelected && (
                  <span className={`text-[10px] font-semibold leading-none mt-0.5 ${badge.style}`}>
                    {badgeLabel(badge)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Type */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">{t("fieldType")}</label>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => { setType("BIG"); reset(); }}
            className={`px-6 py-2 text-sm font-medium transition-colors ${
              type === "BIG" ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {t("typeBig")}
          </button>
          <button
            type="button"
            onClick={() => { setType("SMALL"); setPeriodCount(1); reset(); }}
            className={`px-6 py-2 text-sm font-medium border-l border-slate-200 transition-colors ${
              type === "SMALL" ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {t("typeSmall")}
          </button>
        </div>
      </div>

      {/* Duration — big tests only */}
      {type === "BIG" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">{t("fieldDuration")}</label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
            <button
              type="button"
              onClick={() => { setPeriodCount(1); reset(); }}
              className={`px-6 py-2 text-sm font-medium transition-colors ${
                periodCount === 1 ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {t("duration1")}
            </button>
            <button
              type="button"
              disabled={!hasConsecutiveSlot}
              onClick={() => { setPeriodCount(2); reset(); }}
              title={!hasConsecutiveSlot ? unavailableHint : undefined}
              className={`px-6 py-2 text-sm font-medium border-l border-slate-200 transition-colors ${
                periodCount === 2 ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {t("duration2")}
            </button>
          </div>
          {!hasConsecutiveSlot && (
            <p className="text-xs text-slate-400">{unavailableHint}</p>
          )}
        </div>
      )}

      {/* Generic error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t(error.key, { period: error.period != null ? periodLabel(error.period) : "" })}
        </div>
      )}

      {/* Conflict table */}
      {conflicts && conflicts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-700">
              {t("conflictTitle", { count: conflicts.length })}
            </p>
          </div>
          <div className="divide-y divide-red-100">
            {conflicts.map((c, i) => (
              <div key={i} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-red-900">{c.studentName}</span>
                  <span className="text-xs text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                    {c.reason === "BIG_SAME_DAY"
                      ? t("conflictBigSameDay")
                      : t("conflictWeeklyLimit")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.existingTests.map((test, j) => (
                    <span key={j} className="inline-flex items-center gap-1 text-xs bg-white border border-red-200 rounded-md px-2 py-1 text-red-800">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1 py-0 h-4 ${
                          test.type === "BIG"
                            ? "bg-slate-800 text-white border-slate-800"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {test.type === "BIG" ? t("typeBigShort") : t("typeSmallShort")}
                      </Badge>
                      {test.courseName} · {testDate(test.date)} {periodSpan(test.period, test.periodCount)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button
          type="submit"
          disabled={pending || !date}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("submit")}
        </Button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          {tc("cancel")}
        </button>
      </div>
    </form>
  );
}
