"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getNow } from "@/lib/dates";
import { trpc } from "@/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, Loader2, MapPin, CalendarRange } from "lucide-react";

type Student = { id: string; user: { name: string | null }; studentId: string };
type Slot = { id: string; room: string | null; course: { name: string } } | null;
type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";
type PeriodRecord = { status: string; minutesDelayed: number; isAutoAbsent: boolean };

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
  prevPeriodsRecords?: Record<string, Record<number, PeriodRecord>>;
  prevActivityPeriods?: Record<string, number[]>;
  intercalaryGroupId?: string;
}

const STATUS_CONFIG = {
  PRESENT: { label: "Present", icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200" },
  ABSENT:  { label: "Absent",  icon: XCircle,     color: "text-red-600 bg-red-50 border-red-200" },
  LATE:    { label: "Late",    icon: Clock,        color: "text-amber-600 bg-amber-50 border-amber-200" },
} as const;

function dotStyle(rec: PeriodRecord | undefined, isActivity: boolean): string {
  if (isActivity) return "bg-violet-400 ring-violet-200";
  if (!rec)                    return "bg-yellow-300 ring-yellow-200";
  if (rec.status === "PRESENT") return "bg-green-500 ring-green-200";
  if (rec.status === "LATE")    return "bg-amber-400 ring-amber-200";
  return "bg-red-500 ring-red-200";
}

function dotLabel(p: number, rec: PeriodRecord | undefined, isActivity: boolean): string {
  if (isActivity) return `P${p}: Activity`;
  if (!rec) return `P${p}: Not marked`;
  if (rec.status === "PRESENT") return `P${p}: Present`;
  if (rec.status === "LATE") return `P${p}: Late${rec.minutesDelayed > 0 ? ` · ${rec.minutesDelayed}m` : ""}`;
  return `P${p}: ${rec.isAutoAbsent ? "Auto-Absent" : "Absent"}`;
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
  if (periods.length === 0) return null;
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
            <span className="text-[9px] leading-none font-semibold text-slate-400">P{p}</span>
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
  prevPeriodsRecords = {},
  prevActivityPeriods = {},
  intercalaryGroupId,
}: Props) {
  const router = useRouter();
  const [records, setRecords] = useState<Record<string, { status: AttendanceStatus; minutesDelayed: number }>>(
    () =>
      Object.fromEntries(
        students.map((s) => {
          if (existingRecords[s.id]) return [s.id, existingRecords[s.id]];
          const defaultStatus: AttendanceStatus =
            studentLocations[s.id]?.type === "activity" ? "ABSENT" : "PRESENT";
          return [s.id, { status: defaultStatus, minutesDelayed: 0 }];
        })
      )
  );

  const { mutate: markAttendance, isPending: isPendingRegular } = trpc.attendance.markAttendance.useMutation({
    onSuccess: () => { toast.success("Attendance saved"); router.back(); },
    onError: (e) => toast.error(e.message),
  });

  const { mutate: markIntercalary, isPending: isPendingIntercalary } = trpc.attendance.markIntercalaryAttendance.useMutation({
    onSuccess: () => { toast.success("Attendance saved"); router.back(); },
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
    return <p className="text-slate-400 text-sm">No group selected.</p>;
  }

  return (
    <div className="space-y-4">
      {selectedGroupId && slot && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
          <span>
            <span className="font-semibold text-slate-900">{slot.course.name}</span>
            {slot.room && <span className="text-slate-500"> · Room {slot.room}</span>}
            <span className="text-slate-500"> · Period {selectedPeriod}</span>
          </span>
          {isResubmit && (
            <span className="text-xs text-emerald-700 font-medium">Previously saved — editing</span>
          )}
        </div>
      )}

      {selectedGroupId && !slot && !intercalaryGroupId && students.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          No timetable slot found for this group / period / day.
        </div>
      )}
      {intercalaryGroupId && (
        <div className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm">
          <span className="text-purple-800 font-medium">Intercalary Period {selectedPeriod} — Homegroup Attendance</span>
          {isResubmit && (
            <span className="text-xs text-purple-700 font-medium">Previously saved — editing</span>
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
                  {STATUS_CONFIG[s].label}: {counts[s] ?? 0}
                </span>
              ))}
            </div>

            {/* Dot legend */}
            {prevPeriods.length > 0 && (
              <div className="flex items-center gap-3 text-xs text-slate-500 border-l border-slate-200 pl-4 flex-wrap">
                <span className="font-medium text-slate-600 whitespace-nowrap">Earlier today:</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-500" />Present</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-400" />Late</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-500" />Absent</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-violet-400" />Activity</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-yellow-300" />Not marked</span>
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
                        {loc ? (
                          <p className={`flex items-center gap-1 text-xs font-medium mt-0.5 ${loc.type === "activity" ? "text-violet-600" : "text-blue-600"}`}>
                            {loc.type === "activity" ? <CalendarRange className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                            {loc.type === "activity" ? "Activity" : "Support"}: {loc.name}
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
                              {cfg.label}
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
                          <span className="text-xs text-slate-500">min</span>
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
              {isResubmit ? "Update Attendance" : "Save Attendance"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
