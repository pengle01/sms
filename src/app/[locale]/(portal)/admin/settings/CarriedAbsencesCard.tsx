import { getTranslations } from "next-intl/server";
import { History } from "lucide-react";
import { db } from "@/server/db";
import { fmtDisplayDate } from "@/lib/dates";
import { getSchoolYear } from "@/lib/schoolConfig";
import { carriedYearKey } from "@/server/carriedAbsences";
import { CARRIED_UNTIL } from "@/lib/carriedAbsences";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CarriedAbsencesUpload } from "./CarriedAbsencesUpload";

/** «Απουσίες προηγούμενου συστήματος»: this school year's carried-over numbers. */
export async function CarriedAbsencesCard() {
  const t = await getTranslations("carriedAbsences");
  const schoolYear = carriedYearKey(await getSchoolYear());
  const [agg, latest] = await Promise.all([
    db.carriedAbsence.aggregate({ where: { schoolYear }, _count: true, _sum: { periods: true } }),
    db.carriedAbsence.findFirst({ where: { schoolYear }, select: { updatedAt: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">{t("explain", { until: fmtDisplayDate(CARRIED_UNTIL), year: schoolYear })}</p>
        {latest ? (
          <p className="text-sm text-slate-600">
            {t("state", { students: agg._count, periods: agg._sum.periods ?? 0, date: fmtDisplayDate(latest.updatedAt) })}
          </p>
        ) : (
          <p className="text-sm text-slate-400">{t("empty")}</p>
        )}
        <CarriedAbsencesUpload hasData={!!latest} />
      </CardContent>
    </Card>
  );
}
