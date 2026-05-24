"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { scheduleTest, TestConflict } from "../actions";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Assignment } from "./page";

const DOW_LABEL = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// dayOfWeek: 1=Mon…5=Fri matches Date.getDay() 1=Mon…5=Fri
function getUpcomingDates(dayOfWeek: number, count = 12): string[] {
  const dates: string[] = [];
  const today = new Date();
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
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface Props {
  assignments: Assignment[];
  locale: string;
}

export function TestForm({ assignments, locale }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
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

  const reset = () => { setConflicts(null); setMessage(null); };

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
        setMessage(result.message);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Group + Course */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Class &amp; Subject</label>
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
          <label className="text-sm font-medium text-slate-700">Lesson slot</label>
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
                {DOW_LABEL[s.dayOfWeek]} · P{s.period}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Date — upcoming occurrences of this lesson's day */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">
          Date
          <span className="ml-1.5 text-slate-400 font-normal text-xs">
            {DOW_LABEL[slot.dayOfWeek]}s · P{slot.period}
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          {upcomingDates.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => { setDate(d); reset(); }}
              className={`h-9 px-4 rounded-lg text-sm font-medium border transition-colors ${
                date === d
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
              }`}
            >
              {formatDateLabel(d)}
            </button>
          ))}
        </div>
      </div>

      {/* Type */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Type</label>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => { setType("BIG"); reset(); }}
            className={`px-6 py-2 text-sm font-medium transition-colors ${
              type === "BIG" ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            Big · 45 min
          </button>
          <button
            type="button"
            onClick={() => { setType("SMALL"); setPeriodCount(1); reset(); }}
            className={`px-6 py-2 text-sm font-medium border-l border-slate-200 transition-colors ${
              type === "SMALL" ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            Small · 20 min
          </button>
        </div>
      </div>

      {/* Duration — big tests only */}
      {type === "BIG" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Duration</label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
            <button
              type="button"
              onClick={() => { setPeriodCount(1); reset(); }}
              className={`px-6 py-2 text-sm font-medium transition-colors ${
                periodCount === 1 ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              1 period
            </button>
            <button
              type="button"
              disabled={!hasConsecutiveSlot}
              onClick={() => { setPeriodCount(2); reset(); }}
              title={!hasConsecutiveSlot ? `No lesson in P${slot.period + 1} on this day` : undefined}
              className={`px-6 py-2 text-sm font-medium border-l border-slate-200 transition-colors ${
                periodCount === 2 ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              2 periods
            </button>
          </div>
          {!hasConsecutiveSlot && (
            <p className="text-xs text-slate-400">2 periods not available — no lesson in P{slot.period + 1} on this day</p>
          )}
        </div>
      )}

      {/* Generic error */}
      {message && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
      )}

      {/* Conflict table */}
      {conflicts && conflicts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-700">
              Cannot schedule — {conflicts.length} student{conflicts.length !== 1 ? "s" : ""} have a conflict
            </p>
          </div>
          <div className="divide-y divide-red-100">
            {conflicts.map((c, i) => (
              <div key={i} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-red-900">{c.studentName}</span>
                  <span className="text-xs text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                    {c.reason === "BIG_SAME_DAY"
                      ? "Already has a big test this day"
                      : "Weekly test limit reached"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.existingTests.map((t, j) => (
                    <span key={j} className="inline-flex items-center gap-1 text-xs bg-white border border-red-200 rounded-md px-2 py-1 text-red-800">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1 py-0 h-4 ${
                          t.type === "BIG"
                            ? "bg-slate-800 text-white border-slate-800"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {t.type === "BIG" ? "Big" : "Small"}
                      </Badge>
                      {t.courseName} · {t.dateStr} {t.periodLabel}
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
          Schedule test
        </Button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
