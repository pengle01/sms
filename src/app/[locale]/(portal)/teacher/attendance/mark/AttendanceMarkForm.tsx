"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { getNow } from "@/lib/dates";
import { periodLabel } from "@/lib/periods";
import { breakMinutes } from "@/lib/toilet";
import { trpc } from "@/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, Loader2, MapPin, CalendarRange, LogOut, DoorOpen } from "lucide-react";

type Student = { id: string; user: { name: string | null }; studentId: string };
type Slot = { id: string; room: string | null; course: { name: string } } | null;
type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";
type PeriodRecord = { status: string; minutesDelayed: number; isAutoAbsent: boolean; exitPermit?: boolean };

interface Props {
  students: Student[];
  slot: Slot;
  staffId: string;
  selectedGroupId?: string;
  selectedPeriod: number;
  prevPeriods?: number[];
  attendanceDate?: string;
  isToday?: boolean;
  existingRecords?: Record<string, { status: AttendanceStatus; minutesDelayed: number }>;
  studentLocations?: Record<string, { type: "activity" | "support"; name: string }>;
  /** Active exit permits (Άδεια Εξόδου) covering this period — shown yellow. */
  exitPermits?: Record<string, { reason: string; fromPeriod: number }>;
  /** Today's toilet break per student: an open one, or this period's last. */
  toiletBreaks?: Record<string, { id: string; leftAt: string; returnedAt: string | null }>;
  prevPeriodsRecords?: Record<string, Record<number, PeriodRecord>>;
  prevActivityPeriods?: Record<string, number[]>;
  intercalaryGroupId?: string;
  isExcursion?: boolean;
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Nicosia" });

const STATUS_CONFIG = {
  PRESENT: { key: "present" as const, icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200" },
  ABSENT:  { key: "absent" as const,  icon: XCircle,     color: "text-red-600 bg-red-50 border-red-200" },
  LATE:    { key: "late" as const,    icon: Clock,        color: "text-amber-600 bg-amber-50 border-amber-200" },
} as const;

function dotStyle(rec: PeriodRecord | undefined, isActivity: boolean): string {
  if (isActivity) return "bg-violet-400 ring-violet-200";
  if (!rec)                    return "bg-slate-300 ring-slate-200";
  if (rec.exitPermit)          return "bg-yellow-400 ring-yellow-200";
  if (rec.status === "PRESENT") return "bg-green-500 ring-green-200";
  if (rec.status === "LATE")    return "bg-amber-400 ring-amber-200";
  return "bg-red-500 ring-red-200";
}

function PeriodHistory({
  periods,
  studentRecords,
  activityPeriods,
}: {
  periods: number[];
  studentRecords: Record<number, PeriodRecord> | undefined;
  activityPeriods: number[] | undefined;
}) {
  const t = useTranslations("attendance");
  const locale = useLocale();

  if (periods.length === 0) return null;

  const dotLabel = (p: number, rec: PeriodRecord | undefined, isActivity: boolean): string => {
    const prefix = periodLabel(p, locale);
    if (isActivity) return `${prefix}: ${t("activity")}`;
    if (!rec) return `${prefix}: ${t("notMarked")}`;
    if (rec.exitPermit) return `${prefix}: ${t("exitPermit")}`;
    if (rec.status === "PRESENT") return `${prefix}: ${t("present")}`;
    if (rec.status === "LATE") {
      return `${prefix}: ${t("late")}${rec.minutesDelayed > 0 ? ` · ${rec.minutesDelayed} ${t("minShort")}` : ""}`;
    }
    return `${prefix}: ${rec.isAutoAbsent ? t("autoAbsent") : t("absent")}`;
  };

  return (
    <div className="flex items-end gap-2 mt-1.5">
      {periods.map((p) => {
        const rec = studentRecords?.[p];
        const isActivity = activityPeriods?.includes(p) ?? false;
        return (
          <div
            key={p}
            title={dotLabel(p, rec, isActivity)}
            className="flex flex-col items-center gap-0.5 cursor-default"
          >
            <span className="text-[9px] leading-none font-semibold text-slate-400">{periodLabel(p, locale)}</span>
            <span className={`w-3.5 h-3.5 rounded-full ring-1 ${dotStyle(rec, isActivity)}`} />
          </div>
        );
      })}
    </div>
  );
}

export function AttendanceMarkForm({
  students,
  slot,
  staffId,
  selectedGroupId,
  selectedPeriod,
  prevPeriods = [],
  attendanceDate,
  isToday = true,
  existingRecords = {},
  studentLocations = {},
  exitPermits = {},
  toiletBreaks = {},
  prevPeriodsRecords = {},
  prevActivityPeriods = {},
  intercalaryGroupId,
  isExcursion,
}: Props) {
  const router = useRouter();
  const t = useTranslations("attendance");
  const locale = useLocale();

  // ── Toilet breaks (WC): live per-student state ──────────────────────────
  const [breaks, setBreaks] = useState(toiletBreaks);
  const [wcNow, setWcNow] = useState(() => Date.now());
  const anyOpen = Object.values(breaks).some((b) => b && b.returnedAt === null);
  useEffect(() => {
    if (!anyOpen) return; // tick the elapsed counter only while someone is out
    const iv = setInterval(() => setWcNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, [anyOpen]);

  const { mutate: wcStart, isPending: wcStarting } = trpc.toilet.start.useMutation({
    onSuccess: (b) =>
      setBreaks((m) => ({
        ...m,
        [b.studentId]: { id: b.id, leftAt: new Date(b.leftAt).toISOString(), returnedAt: b.returnedAt ? new Date(b.returnedAt).toISOString() : null },
      })),
    onError: (e) => toast.error(e.message),
  });
  const { mutate: wcEnd, isPending: wcEnding } = trpc.toilet.end.useMutation({
    onSuccess: (b) =>
      setBreaks((m) => ({
        ...m,
        [b.studentId]: { id: b.id, leftAt: new Date(b.leftAt).toISOString(), returnedAt: b.returnedAt ? new Date(b.returnedAt).toISOString() : null },
      })),
    onError: (e) => toast.error(e.message),
  });
  const wcPending = wcStarting || wcEnding;
  const [records, setRecords] = useState<Record<string, { status: AttendanceStatus; minutesDelayed: number }>>(
    () =>
      Object.fromEntries(
        students.map((s) => {
          if (existingRecords[s.id]) return [s.id, existingRecords[s.id]];
          // Exit permit: the student has left — the teacher confirms the absence.
          const defaultStatus: AttendanceStatus =
            exitPermits[s.id] || studentLocations[s.id]?.type === "activity" ? "ABSENT" : "PRESENT";
          return [s.id, { status: defaultStatus, minutesDelayed: 0 }];
        })
      )
  );

  const { mutate: markAttendance, isPending: isPendingRegular } = trpc.attendance.markAttendance.useMutation({
    onSuccess: () => { toast.success(t("savedToast")); router.back(); },
    onError: (e) => toast.error(e.message),
  });

  const { mutate: markIntercalary, isPending: isPendingIntercalary } = trpc.attendance.markIntercalaryAttendance.useMutation({
    onSuccess: () => { toast.success(t("savedToast")); router.back(); },
    onError: (e) => toast.error(e.message),
  });

  const isPending = isPendingRegular || isPendingIntercalary;

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setRecords((r) => ({
      ...r,
      [studentId]: {
        ...r[studentId]!,
        status,
        minutesDelayed: status !== "LATE" ? 0 : r[studentId]!.minutesDelayed,
      },
    }));
  };

  const setDelay = (studentId: string, minutes: number) => {
    setRecords((r) => ({ ...r, [studentId]: { ...r[studentId]!, minutesDelayed: minutes } }));
  };

  const handleSubmit = () => {
    const date = attendanceDate ?? getNow().toISOString().split("T")[0]!;
    if (intercalaryGroupId) {
      markIntercalary({
        groupId: intercalaryGroupId,
        period: selectedPeriod,
        date,
        records: students.map((s) => ({
          studentId: s.id,
          status: records[s.id]?.status ?? "PRESENT",
          minutesDelayed: records[s.id]?.minutesDelayed ?? 0,
        })),
      });
      return;
    }
    if (!slot || !selectedGroupId) return;
    markAttendance({
      records: students.map((s) => ({
        studentId: s.id,
        timetableSlotId: slot.id,
        date,
        status: records[s.id]?.status ?? "PRESENT",
        minutesDelayed: records[s.id]?.minutesDelayed ?? 0,
      })),
    });
  };

  const counts = Object.values(records).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const isResubmit = Object.keys(existingRecords).length > 0;

  if (!selectedGroupId) {
    return <p className="text-slate-400 text-sm">{t("noGroup")}</p>;
  }

  return (
    <div className="space-y-4">
      {selectedGroupId && slot && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
          <span>
            <span className="font-semibold text-slate-900">{slot.course.name}</span>
            {slot.room && <span className="text-slate-500"> · {t("room", { room: slot.room })}</span>}
            <span className="text-slate-500"> · {t("periodN", { period: selectedPeriod })}</span>
          </span>
          {isResubmit && (
            <span className="text-xs text-emerald-700 font-medium">{t("prevSaved")}</span>
          )}
        </div>
      )}

      {selectedGroupId && !slot && !intercalaryGroupId && students.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          {t("noSlotFound")}
        </div>
      )}
      {intercalaryGroupId && (
        <div className={`flex items-center justify-between rounded-lg border px-4 py-2 text-sm ${isExcursion ? "border-blue-200 bg-blue-50" : "border-purple-200 bg-purple-50"}`}>
          <span className={`font-medium ${isExcursion ? "text-blue-800" : "text-purple-800"}`}>
            {isExcursion ? t("excursionBanner") : t("intercalaryBanner", { period: selectedPeriod })}
          </span>
          {isResubmit && (
            <span className="text-xs text-purple-700 font-medium">{t("prevSaved")}</span>
          )}
        </div>
      )}

      {students.length > 0 && (
        <>
          <div className="flex items-start gap-4 flex-wrap">
            {/* Current period counts */}
            <div className="flex gap-2 flex-wrap text-sm">
              {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => (
                <span key={s} className={`px-3 py-1 rounded-full border font-medium ${STATUS_CONFIG[s].color}`}>
                  {t(STATUS_CONFIG[s].key)}: {counts[s] ?? 0}
                </span>
              ))}
            </div>

            {/* Dot legend */}
            {prevPeriods.length > 0 && (
              <div className="flex items-center gap-3 text-xs text-slate-500 border-l border-slate-200 pl-4 flex-wrap">
                <span className="font-medium text-slate-600 whitespace-nowrap">{t("earlierToday")}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-500" />{t("present")}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-400" />{t("late")}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-500" />{t("absent")}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-violet-400" />{t("activity")}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-yellow-400" />{t("exitPermit")}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-slate-300" />{t("notMarked")}</span>
              </div>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-50">
                {students.map((student) => {
                  const rec = records[student.id] ?? { status: "PRESENT" as AttendanceStatus, minutesDelayed: 0 };
                  const loc = studentLocations[student.id];
                  return (
                    <div
                      key={student.id}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
                    >
                      {/* Name + location + period history */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 leading-snug">{student.user?.name}</p>
                        {exitPermits[student.id] && (
                          <p className="flex items-center gap-1 text-xs font-medium mt-0.5 text-yellow-700">
                            <LogOut className="w-3 h-3" />
                            {t("exitPermitFrom", {
                              period: periodLabel(exitPermits[student.id]!.fromPeriod, locale),
                              reason: exitPermits[student.id]!.reason,
                            })}
                          </p>
                        )}
                        {loc ? (
                          <p className={`flex items-center gap-1 text-xs font-medium mt-0.5 ${loc.type === "activity" ? "text-violet-600" : "text-blue-600"}`}>
                            {loc.type === "activity" ? <CalendarRange className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                            {loc.type === "activity" ? t("activity") : t("support")}: {loc.name}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{student.studentId}</p>
                        )}
                        <PeriodHistory
                          periods={prevPeriods}
                          studentRecords={prevPeriodsRecords[student.id]}
                          activityPeriods={prevActivityPeriods[student.id]}
                        />
                      </div>

                      {/* Toilet break (WC): one tap out, one tap back */}
                      {isToday && !intercalaryGroupId && (() => {
                        const brk = breaks[student.id];
                        if (brk && brk.returnedAt === null) {
                          const mins = breakMinutes(brk.leftAt, null, new Date(wcNow));
                          return (
                            <button
                              type="button"
                              disabled={wcPending}
                              onClick={() => wcEnd({ id: brk.id })}
                              title={t("wcReturnHint")}
                              className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                                mins > 10
                                  ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                                  : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${mins > 10 ? "bg-red-500" : "bg-amber-500"}`} />
                              WC {fmtTime(brk.leftAt)} · {mins}′
                            </button>
                          );
                        }
                        return (
                          <div className="flex items-center gap-1.5">
                            {brk?.returnedAt && (
                              <span className="text-[11px] text-slate-400 whitespace-nowrap" title={t("wcDoneHint")}>
                                WC {fmtTime(brk.leftAt)}–{fmtTime(brk.returnedAt)} ({breakMinutes(brk.leftAt, brk.returnedAt, new Date(wcNow))}′)
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={wcPending}
                              onClick={() =>
                                wcStart({
                                  studentId: student.id,
                                  groupId: selectedGroupId,
                                  period: selectedPeriod,
                                  date: attendanceDate ?? new Date().toISOString().slice(0, 10),
                                })
                              }
                              title={t("wcStartHint")}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-300 hover:text-amber-600 hover:border-amber-300 transition-colors"
                            >
                              <DoorOpen className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })()}

                      {/* Status buttons */}
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => {
                          const cfg = STATUS_CONFIG[s];
                          const Icon = cfg.icon;
                          const active = rec.status === s;
                          return (
                            <button
                              key={s}
                              onClick={() => setStatus(student.id, s)}
                              className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                                active ? cfg.color : "border-slate-200 text-slate-500 hover:bg-slate-50"
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {t(cfg.key)}
                            </button>
                          );
                        })}
                      </div>

                      {/* Late delay */}
                      {rec.status === "LATE" && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={60}
                            value={rec.minutesDelayed}
                            onChange={(e) => setDelay(student.id, parseInt(e.target.value) || 0)}
                            className="w-16 h-8 rounded-lg border border-slate-200 px-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <span className="text-xs text-slate-500">{t("minShort")}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSubmit}
              disabled={isPending || (!slot && !intercalaryGroupId)}
              className="h-10 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isResubmit ? t("updateBtn") : t("saveBtn")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
