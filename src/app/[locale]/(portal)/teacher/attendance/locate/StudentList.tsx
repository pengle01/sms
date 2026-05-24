"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export type DayRow = {
  period: number;
  courseName: string | null;
  room: string | null;
  staffName: string | null;
  isActivity: boolean;
  activityName?: string;
};

interface Student {
  id: string;
  user: { name: string | null };
}

interface Props {
  students: Student[];
  groupName: string;
  schedules: Record<string, DayRow[]>;
  periodAttendance: Record<string, Record<number, string>>;
  activityPeriods: Record<string, number[]>;
  currentPeriod: number;
  isWeekend: boolean;
  locale: string;
}

function dot(isActivity: boolean, status: string | undefined): string {
  if (isActivity)            return "bg-violet-400";
  if (!status)               return "bg-yellow-300";
  if (status === "PRESENT")  return "bg-green-500";
  if (status === "LATE")     return "bg-amber-400";
  return "bg-red-500";
}

export function StudentList({
  students,
  groupName,
  schedules,
  periodAttendance,
  activityPeriods,
  currentPeriod,
  isWeekend,
  locale,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const periodStrip = !isWeekend
    ? Array.from({ length: currentPeriod }, (_, i) => i + 1)
    : [];

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        {groupName} · {students.length} student{students.length !== 1 ? "s" : ""}
      </p>
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {students.map((s) => {
              const isExpanded = expandedId === s.id;
              const rows = schedules[s.id] ?? [];
              const periods = periodAttendance[s.id] ?? {};
              const actPeriods = new Set(activityPeriods[s.id] ?? []);

              return (
                <div key={s.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left",
                      isExpanded ? "bg-slate-50" : "hover:bg-slate-50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        "block text-sm font-medium",
                        isExpanded ? "text-emerald-700" : "text-slate-900"
                      )}>
                        {s.user.name}
                      </span>
                      {periodStrip.length > 0 && (
                        <div className="flex items-end gap-1.5 mt-1">
                          {periodStrip.map((p) => (
                            <div key={p} className="flex flex-col items-center gap-0.5">
                              <span className="text-[9px] leading-none font-semibold text-slate-400">P{p}</span>
                              <span className={`w-3 h-3 rounded-full ${dot(actPeriods.has(p), periods[p])}`} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    }
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/80 px-4 pt-3 pb-4">
                      {isWeekend ? (
                        <p className="text-sm text-slate-400 py-2">No school today.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <tbody>
                            {rows.map((row) => {
                              const isCurrent = row.period === currentPeriod;
                              return (
                                <tr
                                  key={row.period}
                                  className={cn(
                                    "border-b border-slate-100 last:border-0",
                                    isCurrent && "bg-emerald-50/70"
                                  )}
                                >
                                  <td className={cn(
                                    "py-2 pr-3 text-xs font-bold w-10",
                                    isCurrent ? "text-emerald-600" : "text-slate-400"
                                  )}>
                                    P{row.period}
                                    {isCurrent && <span className="ml-1 text-[9px]">▶</span>}
                                  </td>
                                  {row.isActivity ? (
                                    <td colSpan={3} className="py-2">
                                      <span className="font-medium text-violet-700">{row.activityName}</span>
                                      <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-200">Activity</Badge>
                                    </td>
                                  ) : row.courseName ? (
                                    <>
                                      <td className="py-2 font-medium text-slate-800">{row.courseName}</td>
                                      <td className="py-2 text-slate-400 text-xs">{row.staffName ?? ""}</td>
                                      <td className="py-2 text-slate-400 text-xs text-right">{row.room ? `Room ${row.room}` : ""}</td>
                                    </>
                                  ) : (
                                    <td colSpan={3} className="py-2 text-slate-300">—</td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                      <div className="mt-3 flex justify-end">
                        <Link
                          href={`/${locale}/teacher/students/${s.id}?view=week`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-emerald-700 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Full week schedule
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {students.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No students in this group</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
