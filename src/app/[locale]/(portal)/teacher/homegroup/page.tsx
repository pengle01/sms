import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, Search, Users } from "lucide-react";
import { groupsForStaff, loadGroupBehavior, type StudentBehaviorRow } from "@/server/behaviorReport";
import type { Flag, Severity } from "@/lib/behaviorFlags";
import { getSchoolYear } from "@/lib/schoolConfig";
import { termOf } from "@/lib/schoolYear";
import { utcMidnight, localDateStr } from "@/lib/dates";

type WindowKey = "30" | "term" | "year";
const WINDOW_KEYS: WindowKey[] = ["30", "term", "year"];

const WEEKDAYS: Record<string, string[]> = {
  // index by ISO weekday (1=Mon … 7=Sun); [0] unused
  el: ["", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"],
  en: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

const SEVERITY_PILL: Record<Severity, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

export default async function HomegroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string; window?: string }>;
}) {
  const { locale } = await params;
  const { groupId: selectedGroupId, window: windowParam } = await searchParams;
  const windowKey: WindowKey = WINDOW_KEYS.includes(windowParam as WindowKey)
    ? (windowParam as WindowKey)
    : "term"; // default: the current τετράμηνο, from the super-admin settings
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const t = await getTranslations("investigate");
  const groups = await groupsForStaff(session.user.id);

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-sm text-slate-400">{t("notAssigned")}</p>
      </div>
    );
  }

  const activeGroup = groups.find((g) => g.id === selectedGroupId) ?? groups[0]!;

  // Window boundary drawn from the super-admin's School Year & Terms settings.
  const today = utcMidnight(localDateStr());
  const ranges = await getSchoolYear();
  let since: Date;
  if (windowKey === "30") {
    since = new Date(today.getTime() - 30 * 86400000);
  } else if (windowKey === "year") {
    since = ranges.yearStart;
  } else {
    // current term: Β΄ once we're past its start, else from the year start (Α΄)
    since = termOf(today, ranges) === "TERM2" ? ranges.term2Start : ranges.yearStart;
  }
  const { students } = await loadGroupBehavior(activeGroup.id, since);

  const weekdayNames = WEEKDAYS[locale] ?? WEEKDAYS.el!;

  // Translate a structured flag into a human reason.
  const flagText = (f: Flag): string => {
    switch (f.code) {
      case "PARTIAL_DAY_ABSENCE":
        return t("flagPartial", { count: f.count });
      case "REPEATED_COURSE_SKIP":
        return t("flagCourseSkip", { count: f.count, course: f.course ?? "—" });
      case "WEEKDAY_CLUSTER":
        return t("flagWeekday", { count: f.count, weekday: weekdayNames[f.weekday ?? 0] ?? "—" });
      case "LATENESS":
        return t("flagLateness", { count: f.count });
      case "TOILET_FREQUENT":
        return t("flagToiletFrequent", { count: f.count });
      case "TOILET_LONG":
        return t("flagToiletLong", { count: f.count });
      case "TOILET_SAME_LESSON":
        return t("flagToiletSameLesson", { count: f.count, course: f.course ?? "—" });
    }
  };

  const watchlist = students
    .filter((s) => s.flags.length > 0)
    .sort((a, b) => b.riskScore - a.riskScore || a.studentName.localeCompare(b.studentName, "el"));

  const dossierHref = (s: StudentBehaviorRow) =>
    `/${locale}/teacher/students/${s.studentProfileId}?from=homegroup&groupId=${activeGroup.id}`;

  const groupParam = `&groupId=${activeGroup.id}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Search className="w-6 h-6 text-slate-700" />
            {t("title")}
          </h2>
          <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
        </div>
        {/* Window toggle — term/year boundaries come from the super-admin settings */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden flex-shrink-0 self-start">
          {WINDOW_KEYS.map((w) => (
            <Link
              key={w}
              href={`?window=${w}${groupParam}`}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l first:border-l-0 border-slate-200 ${
                windowKey === w ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {w === "30" ? t("windowDays", { days: 30 }) : w === "term" ? t("windowTerm") : t("windowYear")}
            </Link>
          ))}
        </div>
      </div>

      {/* Group tabs */}
      {groups.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`?groupId=${g.id}&window=${windowKey}`}
              className={`h-9 px-4 rounded-lg text-sm font-medium border transition-colors ${
                activeGroup.id === g.id
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              {g.name}
            </Link>
          ))}
        </div>
      )}

      {/* Watchlist */}
      <Card className="border-amber-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-amber-800">
            <AlertTriangle className="w-4 h-4" />
            {t("watchlistTitle", { count: watchlist.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {watchlist.length === 0 && <p className="text-sm text-slate-400">{t("watchlistEmpty")}</p>}
          {watchlist.map((s) => (
            <div key={s.studentProfileId} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between border-b border-slate-50 pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                <Link href={dossierHref(s)} className="font-medium text-slate-900 hover:text-emerald-700 hover:underline">
                  {s.studentName}
                </Link>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {s.flags.map((f, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${SEVERITY_PILL[f.severity]}`}
                    >
                      {flagText(f)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Full roster */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            {t("rosterTitle", { name: activeGroup.name, count: students.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <th className="text-left px-5 py-3">{t("colStudent")}</th>
                <th className="text-center px-3 py-3">{t("colAbsences")}</th>
                <th className="text-center px-3 py-3">{t("colPartial")}</th>
                <th className="text-center px-3 py-3">{t("colLates")}</th>
                <th className="text-center px-3 py-3">{t("colReferrals")}</th>
                <th className="text-center px-3 py-3">{t("colToilet")}</th>
                <th className="text-center px-3 py-3">{t("colLowGrades")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students.map((s) => (
                <tr key={s.studentProfileId} className={`hover:bg-slate-50 ${s.flags.length ? "bg-amber-50/30" : ""}`}>
                  <td className="px-5 py-3 font-medium text-slate-900">
                    <Link href={dossierHref(s)} className="hover:text-emerald-700 hover:underline">
                      {s.studentName}
                    </Link>
                  </td>
                  <NumCell value={s.totals.absences} warn={5} alert={10} />
                  <NumCell value={s.totals.partialDays} warn={2} alert={3} />
                  <NumCell value={s.totals.lates} warn={4} alert={8} />
                  <NumCell value={s.totals.referrals} warn={1} alert={3} tone="orange" />
                  <NumCell value={s.totals.toilet} warn={5} alert={10} />
                  <NumCell value={s.totals.lowGrades} warn={1} alert={3} tone="orange" />
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">{t("noStudents")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function NumCell({
  value,
  warn,
  alert,
  tone = "amber",
}: {
  value: number;
  warn: number;
  alert: number;
  tone?: "amber" | "orange";
}) {
  if (value === 0) {
    return (
      <td className="px-3 py-3 text-center">
        <span className="text-slate-200">—</span>
      </td>
    );
  }
  const cls =
    value >= alert
      ? "bg-red-100 text-red-700"
      : value >= warn
        ? tone === "orange"
          ? "bg-orange-100 text-orange-700"
          : "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-600";
  return (
    <td className="px-3 py-3 text-center">
      <span className={`inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-xs font-bold ${cls}`}>
        {value}
      </span>
    </td>
  );
}
