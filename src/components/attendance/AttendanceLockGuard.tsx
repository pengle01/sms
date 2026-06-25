"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { trpc } from "@/trpc/client";
import { fmtDisplayDate } from "@/lib/dates";
import { periodLabel } from "@/lib/periods";

/**
 * Attendance-completion lock. A full-screen blocking overlay shown across the
 * teacher portal while the teacher has unmarked past lessons (and the super
 * admin has enabled the lock). Lives client-side so it re-evaluates on every
 * navigation via usePathname() — a server layout/template can't, because shared
 * segments don't re-render between their child pages.
 *
 * The marking route is exempt so the "record" links can open it; marking
 * invalidates the query, so the overlay shrinks and lifts as lessons are filed.
 */
export function AttendanceLockGuard({ locale }: { locale: string }) {
  const t = useTranslations("attendanceLock");
  const pathname = usePathname();
  const onMarkRoute = pathname.includes("/teacher/attendance/mark");

  const { data } = trpc.attendance.lockStatus.useQuery(undefined, {
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  if (onMarkRoute || !data?.locked) return null;

  const pending = data.pending;
  const CAP = 60;
  const shown = pending.slice(0, CAP);
  const byDate = new Map<string, typeof shown>();
  for (const p of shown) {
    const list = byDate.get(p.dateIso);
    if (list) list.push(p);
    else byDate.set(p.dateIso, [p]);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 shadow-lg">
          <Lock className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-xl font-bold text-amber-900">{t("title")}</h2>
            <p className="text-sm text-amber-800 mt-1">{t("intro", { n: pending.length })}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-lg divide-y divide-slate-100">
          {[...byDate.entries()].map(([dateIso, lessons]) => (
            <div key={dateIso} className="px-5 py-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                {fmtDisplayDate(dateIso + "T00:00:00.000Z")}
              </p>
              <div className="space-y-1.5">
                {lessons.map((l, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="inline-flex w-9 justify-center rounded bg-slate-100 text-xs font-semibold text-slate-600 py-0.5">
                      {periodLabel(l.period, locale)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-900">{l.courseName}</span>
                      <span className="text-xs text-slate-400 ml-2">{l.groupName}</span>
                    </div>
                    <Link
                      href={`/${locale}/teacher/attendance/mark?groupId=${l.groupId}&period=${l.period}&date=${l.dateIso}`}
                      className="inline-flex items-center h-8 px-3 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
                    >
                      {t("mark")}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {pending.length > shown.length && (
            <p className="px-5 py-3 text-xs text-slate-400 text-center">{t("more", { n: pending.length - shown.length })}</p>
          )}
        </div>
      </div>
    </div>
  );
}
