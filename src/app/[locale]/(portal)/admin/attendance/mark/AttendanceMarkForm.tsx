"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, FileText, Loader2 } from "lucide-react";

type Student = { id: string; user: { name: string | null }; studentId: string };
type Group = { id: string; name: string; grade: number };
type Slot = { id: string; room: string | null; course: { name: string } } | null;
type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

interface Props {
  groups: Group[];
  students: Student[];
  slot: Slot;
  staffId: string;
  selectedGroupId?: string;
  selectedPeriod: number;
}

export function AttendanceMarkForm({ groups, students, slot, staffId, selectedGroupId, selectedPeriod }: Props) {
  const router = useRouter();
  const [records, setRecords] = useState<Record<string, { status: AttendanceStatus; minutesDelayed: number }>>(
    () => Object.fromEntries(students.map((s) => [s.id, { status: "PRESENT", minutesDelayed: 0 }]))
  );

  const { mutate: markAttendance, isPending } = trpc.attendance.markAttendance.useMutation({
    onSuccess: () => {
      toast.success("Attendance saved");
      router.back();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(window.location.search);
    params.set("groupId", e.target.value);
    router.push(`?${params.toString()}`);
  };

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(window.location.search);
    params.set("period", e.target.value);
    router.push(`?${params.toString()}`);
  };

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setRecords((r) => ({ ...r, [studentId]: { ...r[studentId]!, status, minutesDelayed: status !== "LATE" ? 0 : r[studentId]!.minutesDelayed } }));
  };

  const setDelay = (studentId: string, minutes: number) => {
    setRecords((r) => ({ ...r, [studentId]: { ...r[studentId]!, minutesDelayed: minutes } }));
  };

  const handleSubmit = () => {
    if (!slot || !selectedGroupId) return;
    const today = new Date().toISOString().split("T")[0]!;
    markAttendance({
      records: students.map((s) => ({
        studentId: s.id,
        timetableSlotId: slot.id,
        date: today,
        status: records[s.id]?.status ?? "PRESENT",
        minutesDelayed: records[s.id]?.minutesDelayed ?? 0,
      })),
    });
  };

  const statusConfig = {
    PRESENT: { label: "Present", icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200" },
    ABSENT:  { label: "Absent",  icon: XCircle,     color: "text-red-600 bg-red-50 border-red-200" },
    LATE:    { label: "Late",    icon: Clock,        color: "text-amber-600 bg-amber-50 border-amber-200" },
    EXCUSED: { label: "Excused", icon: FileText,     color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  } as const;

  const counts = Object.values(records).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Group + Period selectors */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={selectedGroupId ?? ""}
          onChange={handleGroupChange}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">Select group…</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <select
          value={selectedPeriod}
          onChange={handlePeriodChange}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          {[1, 2, 3, 4, 5, 6, 7].map((p) => (
            <option key={p} value={p}>Period {p}</option>
          ))}
        </select>
      </div>

      {!selectedGroupId && (
        <p className="text-slate-400 text-sm">Select a group to begin marking attendance.</p>
      )}

      {selectedGroupId && slot && (
        <div className="text-sm text-slate-600 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
          <span className="font-medium">{slot.course.name}</span>
          {slot.room && <span className="text-slate-500"> · Room {slot.room}</span>}
        </div>
      )}

      {selectedGroupId && !slot && students.length > 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          No timetable slot found for this group/period/day. You can still record attendance.
        </div>
      )}

      {students.length > 0 && (
        <>
          {/* Summary */}
          <div className="flex gap-3 flex-wrap text-sm">
            {(Object.keys(statusConfig) as AttendanceStatus[]).map((s) => (
              <span key={s} className={`px-3 py-1 rounded-full border font-medium ${statusConfig[s].color}`}>
                {statusConfig[s].label}: {counts[s] ?? 0}
              </span>
            ))}
          </div>

          {/* Student list */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-50">
                {students.map((student) => {
                  const rec = records[student.id] ?? { status: "PRESENT" as AttendanceStatus, minutesDelayed: 0 };
                  return (
                    <div key={student.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 text-sm">{student.user.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{student.studentId}</p>
                      </div>

                      {/* Status buttons — wrap on small screens */}
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(statusConfig) as AttendanceStatus[]).map((s) => {
                          const cfg = statusConfig[s];
                          const Icon = cfg.icon;
                          const active = rec.status === s;
                          return (
                            <button
                              key={s}
                              onClick={() => setStatus(student.id, s)}
                              className={`h-8 px-3 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                active ? cfg.color : "border-slate-200 text-slate-500 hover:bg-slate-50"
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {cfg.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Delay input — only for LATE */}
                      {rec.status === "LATE" && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={60}
                            value={rec.minutesDelayed}
                            onChange={(e) => setDelay(student.id, parseInt(e.target.value) || 0)}
                            className="w-16 h-8 px-2 rounded-lg border border-slate-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              disabled={isPending || !slot}
              className="h-10 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Attendance
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
