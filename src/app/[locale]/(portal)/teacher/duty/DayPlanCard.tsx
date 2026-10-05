import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarDays, Printer } from "lucide-react";
import { db } from "@/server/db";
import { utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { staffDisplayName } from "@/lib/staffName";
import { SCHOOL_ABSENCE_SOURCE, readImportMeta } from "@/lib/substitutionImport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";

const KIND_STYLE: Record<string, string> = {
  COVER: "bg-sky-50 text-sky-700 border-sky-200",
  SWAP: "bg-sky-50 text-sky-700 border-sky-200",
  STUDY_HALL: "bg-violet-50 text-violet-700 border-violet-200",
  CHAPERONE_HALL: "bg-teal-50 text-teal-700 border-teal-200",
  RELEASE: "bg-amber-50 text-amber-700 border-amber-200",
  ROOM_CHANGE: "bg-slate-50 text-slate-700 border-slate-200",
  SUPPORT_MERGE: "bg-slate-50 text-slate-700 border-slate-200",
};

/**
 * The whole day's FINALIZED substitution plan, read-only — the deputies'
 * «Πρόγραμμα αναπληρώσεων» tab under «Εφημερίες». Absence reasons are left out (they
 * can be health data); the printed sheet stays one click away.
 */
export async function DayPlanCard({ locale, dateStr }: { locale: string; dateStr: string }) {
  const t = await getTranslations("substitutions");
  const date = utcMidnight(dateStr);
  const plan = await db.substitutionPlan.findFirst({
    where: { date, status: "FINAL" },
    include: {
      entries: {
        include: {
          group: { select: { name: true } },
          absentStaff: { select: { scheduleName: true, user: { select: { name: true } } } },
          substituteStaff: { select: { scheduleName: true, user: { select: { name: true } } } },
        },
      },
    },
  });
  const entries = (plan?.entries ?? []).sort(
    (a, b) =>
      (a.period ?? 0) - (b.period ?? 0) ||
      (a.group?.name ?? "").localeCompare(b.group?.name ?? "", "el", { numeric: true }),
  );
  const meta = plan?.source === SCHOOL_ABSENCE_SOURCE ? readImportMeta(plan.importMeta) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-500" />
            {t("dayPlanTitle", { date: fmtDisplayDate(date) })}
          </CardTitle>
          <div className="flex items-center gap-2">
            <form method="GET" className="flex items-center gap-2">
              <input type="hidden" name="tab" value="plan" />
              <DateInput name="planDate" defaultValue={dateStr} className="h-8 w-32 px-2 rounded-lg border border-slate-200 text-sm" />
              <button type="submit" className="h-8 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                {t("dayPlanShow")}
              </button>
            </form>
            {plan && (
              <Link
                href={`/${locale}/teacher/substitutions/plan/${dateStr}/print`}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
              >
                <Printer className="w-3.5 h-3.5" />
                {t("dayPlanPrint")}
              </Link>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!plan ? (
          <p className="text-sm text-slate-400">{t("dayPlanNone")}</p>
        ) : (
          <div className="space-y-4">
            {meta && meta.absences.length > 0 && (
              <p className="text-sm text-slate-600">
                <span className="font-semibold">{t("dayPlanAbsent")}:</span>{" "}
                {meta.absences
                  .map((a) => (a.periods.length > 0 ? `${a.teacher} (Π ${a.periods.join(", ")})` : a.teacher))
                  .join(" · ")}
              </p>
            )}
            {entries.length === 0 ? (
              <p className="text-sm text-slate-400">{t("dayPlanEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="py-2 pr-3">{t("period")}</th>
                      <th className="py-2 pr-3">{t("group")}</th>
                      <th className="py-2 pr-3">{t("dayPlanAbsentCol")}</th>
                      <th className="py-2 pr-3">{t("dayPlanWhat")}</th>
                      <th className="py-2 pr-3">{t("dayPlanWho")}</th>
                      <th className="py-2">{t("newRoom")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {entries.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2 pr-3 font-semibold">Π{e.period}</td>
                        <td className="py-2 pr-3">{e.group?.name ?? "—"}</td>
                        <td className="py-2 pr-3 text-slate-600">{e.absentStaff ? staffDisplayName(e.absentStaff) : "—"}</td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className={`text-xs ${KIND_STYLE[e.kind] ?? ""}`}>
                            {t(`kind_${e.kind}` as Parameters<typeof t>[0])}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">
                          {e.substituteStaff ? staffDisplayName(e.substituteStaff) : ""}
                          {e.note && <span className="block text-xs text-slate-500">{e.note}</span>}
                        </td>
                        <td className="py-2">{e.newRoom ?? e.room ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {meta && meta.duty.length > 0 && (
              <p className="text-sm text-amber-700">
                <span className="font-semibold">{t("dayPlanDuty")}:</span> {meta.duty.map((d) => `${d.teacher} — ${d.message}`).join(" · ")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
