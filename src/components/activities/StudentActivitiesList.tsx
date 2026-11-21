import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, MapPin, User } from "lucide-react";
import { utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { activityPeriods, splitActivities, type StudentActivityRow } from "@/lib/studentActivities";

/**
 * A student's activities this school year: upcoming first (soonest on top),
 * then those already held (latest on top). Shared by the student's own page
 * and the parents' page for a child.
 */
export async function StudentActivitiesList({
  rows,
  locale,
}: {
  rows: StudentActivityRow[];
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: "studentActivities" });
  const tShared = await getTranslations({ locale, namespace: "tests" });
  const DOW = tShared.raw("dow") as string[];
  const { upcoming, past } = splitActivities(rows, utcMidnight());

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">{t("none")}</p>
      </div>
    );
  }

  const list = (items: StudentActivityRow[], faded = false) => (
    <Card>
      <CardContent className={`p-0 divide-y divide-slate-100 ${faded ? "opacity-70" : ""}`}>
        {items.map((a) => (
          <div key={a.id} className="px-5 py-3 flex flex-wrap items-start gap-x-4 gap-y-1">
            <div className="w-32 flex-shrink-0">
              <p className="text-sm font-medium text-slate-900">
                {DOW[a.date.getUTCDay()]} {fmtDisplayDate(a.date)}
              </p>
              <p className="text-xs text-slate-400">{activityPeriods(a.startPeriod, a.endPeriod, locale)}</p>
            </div>
            <div className="flex-1 min-w-[12rem]">
              <p className="text-sm font-medium text-slate-800">{a.name}</p>
              <div className="flex flex-wrap gap-x-3 text-xs text-slate-500 mt-0.5">
                {a.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {a.location}
                  </span>
                )}
                {a.teacher && (
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {a.teacher}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("upcoming")}</p>
        {upcoming.length > 0 ? list(upcoming) : <p className="text-sm text-slate-400">{t("noneUpcoming")}</p>}
      </div>
      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("past")}</p>
          {list(past, true)}
        </div>
      )}
    </div>
  );
}
