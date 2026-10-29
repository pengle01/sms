import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Award, Printer, Users } from "lucide-react";
import { fmtDisplayDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { groupAwardsByActivity, myDdkSummary } from "@/lib/ddk";
import { loadMyDdkAwards } from "@/server/ddk";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteActivityDdkButton } from "./DeleteActivityDdkButton";

const DOW = ["Κυρ", "Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ"];

/**
 * «Τα ΔΔΚ μου» on «Δραστηριότητες»: the activities the teacher converted to
 * ΔΔΚ in a school year, with how many students got points; an activity's ΔΔΚ
 * can be removed as a whole. `years` = the years with awards
 * plus the current one, newest first.
 */
export async function MyDdkCard({
  locale,
  staffId,
  schoolYear,
  currentYear,
  years,
}: {
  locale: string;
  staffId: string;
  schoolYear: string;
  currentYear: string;
  years: string[];
}) {
  const t = await getTranslations("ddkMine");
  const awards = await loadMyDdkAwards(staffId, schoolYear);
  const groups = groupAwardsByActivity(awards);
  const summary = myDdkSummary(awards);
  const yearQs = schoolYear === currentYear ? "" : `?year=${schoolYear}`;

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2 text-amber-800">
            <Award className="w-4 h-4" />
            {t("title")} ({groups.length})
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {years.length > 1 &&
              years.map((y) => (
                <Link
                  key={y}
                  href={y === currentYear ? "?" : `?ddkYear=${y}`}
                  scroll={false}
                  className={cn(
                    "h-8 px-3 flex items-center rounded-lg border text-xs font-medium",
                    y === schoolYear ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400",
                  )}
                >
                  {y}
                </Link>
              ))}
            {awards.length > 0 && (
              <Link
                href={`/${locale}/teacher/ddk/mine/print${yearQs}`}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50"
              >
                <Printer className="w-3.5 h-3.5" />
                {t("print")}
              </Link>
            )}
          </div>
        </div>
        {awards.length > 0 && (
          <p className="text-xs text-slate-500">
            {t("summary", { year: schoolYear, awards: summary.awards, students: summary.students, points: summary.points })}
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0 divide-y divide-slate-50">
        {awards.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">{t("empty", { year: schoolYear })}</p>
        ) : (
          groups.map((g) => (
            <div key={g.activity?.id ?? "none"} className="flex items-center gap-4 px-5 py-4">
              <div className="w-16 text-center flex-shrink-0">
                {g.activity && (
                  <>
                    <p className="text-xs font-medium text-slate-400 uppercase">{DOW[g.activity.date.getUTCDay()]}</p>
                    <p className="text-sm font-bold text-slate-600 leading-tight">{fmtDisplayDate(g.activity.date)}</p>
                  </>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {g.activity ? (
                  <Link href={`/${locale}/teacher/activities/${g.activity.id}`} className="font-medium text-slate-900 hover:underline">
                    {g.activity.name}
                  </Link>
                ) : (
                  <p className="font-medium text-slate-500">{t("noActivity")}</p>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm text-slate-500 flex-shrink-0" title={t("studentsTitle")}>
                <Users className="w-4 h-4" />
                {new Set(g.awards.map((a) => a.studentId)).size}
              </div>
              <DeleteActivityDdkButton
                activityId={g.activity?.id ?? null}
                schoolYear={schoolYear}
                label={t("remove")}
                confirmText={t("removeConfirm", { name: g.activity?.name ?? t("noActivity") })}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
