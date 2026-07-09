"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getNow } from "@/lib/dates";
import { trpc } from "@/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";

type Student = { id: string; user: { name: string | null }; studentId: string };
type Group = { id: string; name: string; grade: number };
type Slot = { id: string; room: string | null; course: { name: string } } | null;
type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";

interface Props {
  groups: Group[];
  students: Student[];
  slot: Slot;
  staffId: string;
  selectedGroupId?: string;
  selectedPeriod: number;
  existingRecords?: Record<string, { status: AttendanceStatus; minutesDelayed: number }>;
}

const STATUS_CONFIG = {
  PRESENT: { label: "Παρών", icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200" },
  ABSENT:  { label: "Απών",  icon: XCircle,     color: "text-red-600 bg-red-50 border-red-200" },
  LATE:    { label: "Καθυστέρηση",    icon: Clock,        color: "text-amber-600 bg-amber-50 border-amber-200" },
} as const;

export function AttendanceMarkForm({
  groups,
  students,
  slot,
  staffId,
  selectedGroupId,
  selectedPeriod,
  existingRecords = {},
}: Props) {
  const router = useRouter();
  const [records, setRecords] = useState<Record<string, { status: AttendanceStatus; minutesDelayed: number }>>(
    () =>
      Object.fromEntries(
        students.map((s) => [
          s.id,
          existingRecords[s.id] ?? { status: "PRESENT" as AttendanceStatus, minutesDelayed: 0 },
        ])
      )
  );

  const { mutate: markAttendance, isPending } = trpc.attendance.markAttendance.useMutation({
    onSuccess: () => {
      toast.success("Οι απουσίες αποθηκεύτηκαν");
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
    if (!slot || !selectedGroupId) return;
    const today = getNow().toISOString().split("T")[0]!;
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

  const counts = Object.values(records).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const isResubmit = Object.keys(existingRecords).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
          <select
            value={selectedGroupId ?? ""}
            onChange={handleGroupChange}
            className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="">Επιλογή τμήματος…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select
            value={selectedPeriod}
            onChange={handlePeriodChange}
            className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
              <option key={p} value={p}>Ώρα {p}</option>
            ))}
          </select>
        </div>

      {!selectedGroupId && (
        <p className="text-slate-400 text-sm">Επιλέξτε τμήμα για να ξεκινήσετε την καταχώρηση.</p>
      )}

      {selectedGroupId && slot && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
          <span>
            <span className="font-semibold text-slate-900">{slot.course.name}</span>
            {slot.room && <span className="text-slate-500"> · Αίθ. {slot.room}</span>}
            <span className="text-slate-500"> · Ώρα {selectedPeriod}</span>
          </span>
          {isResubmit && (
            <span className="text-xs text-emerald-700 font-medium">Αποθηκεύτηκε προηγουμένως — επεξεργασία</span>
          )}
        </div>
      )}

      {selectedGroupId && !slot && students.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Δεν βρέθηκε ώρα προγράμματος για αυτό το τμήμα/ώρα/ημέρα.
        </div>
      )}

      {students.length > 0 && (
        <>
          {/* Summary counts */}
          <div className="flex gap-2 flex-wrap text-sm">
            {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => (
              <span
                key={s}
                className={`px-3 py-1 rounded-full border font-medium ${STATUS_CONFIG[s].color}`}
              >
                {STATUS_CONFIG[s].label}: {counts[s] ?? 0}
              </span>
            ))}
          </div>

          {/* Student rows */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-50">
                {students.map((student) => {
                  const rec = records[student.id] ?? { status: "PRESENT" as AttendanceStatus, minutesDelayed: 0 };
                  return (
                    <div
                      key={student.id}
                      className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{student.user?.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{student.studentId}</p>
                      </div>

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
                          <span className="text-xs text-slate-500">λεπ</span>
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
              {isResubmit ? "Ενημέρωση Απουσιών" : "Αποθήκευση Απουσιών"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
