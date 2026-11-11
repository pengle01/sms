import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActiveAuth } from "@/server/authz";
import {
  BEHAVIOR_WINDOWS,
  behaviorRange,
  groupsForStaff,
  loadGroupColumnDetail,
  parseBehaviorWindow,
} from "@/server/behaviorReport";
import { BEHAVIOR_COLUMNS, parseBehaviorColumn, type BehaviorColumn, type DetailEntry } from "@/lib/behaviorDetail";
import { parseBehaviorWeek, weekMonday } from "@/lib/behaviorWeek";
import { fmtDisplayDate, getNow, localDateStr } from "@/lib/dates";
import { getSchoolName } from "@/lib/schoolConfig";
import { carriedAbsencesForWindow } from "@/server/carriedAbsences";
import { CARRIED_UNTIL, formatAbsenceTotal } from "@/lib/carriedAbsences";
import { PrintBar } from "@/app/[locale]/(portal)/teacher/substitutions/plan/[date]/print/PrintBar";

const COLUMN_LABEL: Record<BehaviorColumn, string> = {
  absences: "colAbsences",
  activityAbsences: "colActivityAbsences",
  partialDays: "colPartial",
  lates: "colLates",
  referrals: "colReferrals",
  toilet: "colToilet",
  lowGrades: "colLowGrades",
};

/**
 * What stands behind a column of «Τμήμα μου»: one line per student with every
 * absence, toilet break, … in the chosen period, on screen and on paper. Only the
 * viewer's own homegroups.
 */
export default async function HomegroupColumnReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string; window?: string; week?: string; column?: string }>;
}) {
  const { locale } = await params;
  const { groupId, window: windowParam, week: weekParam, column: columnParam } = await searchParams;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);

  const groups = await groupsForStaff(auth.userId);
  if (groups.length === 0) redirect(`/${locale}/teacher/homegroup`);
  const active = groups.find((g) => g.id === groupId) ?? groups[0]!;

  const windowKey = parseBehaviorWindow(windowParam);
  const todayIso = localDateStr();
  const week = parseBehaviorWeek(weekParam, todayIso);
  const weekQs = windowKey === "week" && week !== weekMonday(todayIso) ? `&week=${week}` : "";
  const column = parseBehaviorColumn(columnParam);
  const { since, until } = await behaviorRange(windowKey, week);

  const [t, schoolName, { lines, none }] = await Promise.all([
    getTranslations("investigate"),
    getSchoolName(),
    loadGroupColumnDetail(active.id, column, since, until, (ids) => carriedAbsencesForWindow(ids, windowKey)),
  ]);
  const windowLabel = (w: string) =>
    w === "week" ? t("windowWeek") : w === "30" ? t("windowDays", { days: 30 }) : w === "term" ? t("windowTerm") : t("windowYear");
  const backHref = `/${locale}/teacher/homegroup?groupId=${active.id}&window=${windowKey}${weekQs}`;
  const href = (over: { column?: string; window?: string }) => {
    const w = over.window ?? windowKey;
    const wk = w === "week" && week !== weekMonday(todayIso) ? `&week=${week}` : "";
    return `?groupId=${active.id}&window=${w}${wk}&column=${over.column ?? column}`;
  };
  const tab = (on: boolean) =>
    `inline-flex items-center h-8 px-3 rounded-lg border text-xs font-medium ${
      on ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
    }`;

  const entryText = (e: DetailEntry): string => {
    const parts = [fmtDisplayDate(e.date)];
    if (e.periods) parts.push(e.periods.map((p) => t("detailPeriod", { period: p })).join(", "));
    else if (e.period != null) parts.push(t("detailPeriod", { period: e.period }));
    if (e.referralNumber != null) parts.unshift(`#${e.referralNumber}`);
    if (e.label) parts.push(e.onActivity ? t("detailActivity", { name: e.label }) : e.label);
    if (e.inProgress) parts.push(t("detailInProgress"));
    else if (e.minutes) parts.push(t("detailMinutes", { minutes: e.minutes }));
    if (e.mark != null) parts.push(e.mark);
    if (e.referralId) parts.push(e.outcome ?? t("detailPending"));
    return parts.join(" · ");
  };

  return (
    <>
      <PrintBar backHref={backHref} />
      <div className="max-w-5xl mx-auto px-6 py-6 print:px-0 print:py-0 print:max-w-none space-y-4 bg-white">
        <div className="flex flex-wrap gap-2 print:hidden">
          {groups.length > 1 &&
            groups.map((g) => (
              <Link key={g.id} href={`?groupId=${g.id}&window=${windowKey}${weekQs}&column=${column}`} className={tab(g.id === active.id)}>
                {g.name}
              </Link>
            ))}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {BEHAVIOR_COLUMNS.map((c) => (
            <Link key={c} href={href({ column: c })} className={tab(c === column)}>
              {t(COLUMN_LABEL[c])}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {BEHAVIOR_WINDOWS.map((w) => (
            <Link key={w} href={href({ window: w })} className={tab(w === windowKey)}>
              {windowLabel(w)}
            </Link>
          ))}
        </div>

        <div className="pb-3 border-b-2 border-black">
          {schoolName && <p className="text-xs uppercase tracking-widest text-slate-500">{schoolName}</p>}
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            {t(COLUMN_LABEL[column])} · {active.name}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {t("printPeriod", {
              window: windowLabel(windowKey),
              from: fmtDisplayDate(since),
              to: fmtDisplayDate(until ?? getNow()),
            })}
          </p>
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-slate-500">{t("detailEmpty")}</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {lines.map((l) => (
              <div key={l.studentId} id={`s-${l.studentId}`} className="py-2.5 scroll-mt-4 break-inside-avoid">
                <p className="text-sm font-semibold text-slate-900">
                  {l.studentName}
                  <span className="ml-2 inline-flex min-w-6 justify-center rounded-full bg-slate-100 px-1.5 text-xs font-bold text-slate-700">
                    {formatAbsenceTotal(l.carried, l.entries.length)}
                  </span>
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {l.carried > 0 && (
                    <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 print:border-slate-400">
                      {t("detailCarried", { count: l.carried, date: fmtDisplayDate(CARRIED_UNTIL) })}
                    </span>
                  )}
                  {l.entries.map((e, i) =>
                    e.referralId ? (
                      <Link
                        key={i}
                        href={`/${locale}/teacher/referrals/${e.referralId}/print`}
                        target="_blank"
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700 hover:border-slate-400 print:border-slate-400"
                      >
                        {entryText(e)}
                      </Link>
                    ) : (
                      <span key={i} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700 print:border-slate-400">
                        {entryText(e)}
                      </span>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {lines.length > 0 && none > 0 && <p className="text-xs text-slate-500">{t("detailNone", { count: none })}</p>}
      </div>
    </>
  );
}
