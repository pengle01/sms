"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { breakMinutes, breakSeverity, breakCounts } from "@/lib/toilet";
import { cn } from "@/lib/utils";
import { DoorOpen, CheckCircle2 } from "lucide-react";

export type ToiletRow = {
  id: string;
  studentId: string;
  studentName: string;
  groupName: string | null;
  period: number;
  leftAt: string;
  returnedAt: string | null;
  staffName: string | null;
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Nicosia" });

const SEVERITY_STYLES = {
  ok: { row: "border-l-emerald-400 bg-emerald-50/30", pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  warn: { row: "border-l-amber-400 bg-amber-50/40", pill: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  overdue: { row: "border-l-red-500 bg-red-50/50", pill: "bg-red-100 text-red-700", dot: "bg-red-500" },
} as const;

export function ToiletPanel({ breaks: initial }: { breaks: ToiletRow[] }) {
  const t = useTranslations("duty");
  const [now, setNow] = useState(() => Date.now());

  // Live feed: teacher updates (exits/returns) appear here automatically —
  // the query re-polls every 10s and immediately on window focus.
  const { data } = trpc.toilet.listToday.useQuery(undefined, {
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
  const breaks = data ?? initial;

  const open = breaks
    .filter((b) => b.returnedAt === null)
    .sort((a, b) => a.leftAt.localeCompare(b.leftAt)); // longest-out first
  const returned = breaks
    .filter((b) => b.returnedAt !== null)
    .sort((a, b) => b.leftAt.localeCompare(a.leftAt));

  // tick the elapsed-time counters
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(tick);
  }, []);

  // smart flag: 3rd+ exit today = frequent leaver
  const counts = useMemo(() => breakCounts(breaks), [breaks]);

  if (breaks.length === 0) {
    return <p className="text-sm text-slate-400">{t("wcNone")}</p>;
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Currently out — urgency-ordered, colour-escalated */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <DoorOpen className="w-4 h-4 text-amber-500" />
            {t("wcOutNow")}
            {open.length > 0 && (
              <span className="text-xs font-semibold text-slate-400">({open.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {open.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-400">{t("wcNoneOut")}</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {open.map((b) => {
                const sev = breakSeverity(b.leftAt, new Date(now));
                const s = SEVERITY_STYLES[sev];
                const mins = breakMinutes(b.leftAt, null, new Date(now));
                return (
                  <div key={b.id} className={cn("flex items-center gap-3 px-4 py-3 border-l-4", s.row)}>
                    <span className={cn("w-2 h-2 rounded-full flex-shrink-0 animate-pulse", s.dot)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {b.studentName}
                        {(counts[b.studentId] ?? 0) >= 3 && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-red-100 border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            {t("wcNth", { n: counts[b.studentId]! })}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        {b.groupName} · Π{b.period}
                        {b.staffName && <> · {b.staffName}</>}
                      </p>
                    </div>
                    {/* return is recorded only by the teacher in the classroom */}
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold flex-shrink-0", s.pill)}>
                      {fmtTime(b.leftAt)} · {mins}′
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Returned today */}
      {returned.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {t("wcReturned")}
              <span className="text-xs font-semibold text-slate-400">({returned.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-50">
              {returned.slice(0, 15).map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">
                      {b.studentName}
                      {(counts[b.studentId] ?? 0) >= 3 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                          {t("wcNth", { n: counts[b.studentId]! })}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {b.groupName} · Π{b.period}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 font-mono flex-shrink-0">
                    {fmtTime(b.leftAt)}–{fmtTime(b.returnedAt!)} ({breakMinutes(b.leftAt, b.returnedAt, new Date(now))}′)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
