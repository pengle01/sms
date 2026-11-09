import { getTranslations } from "next-intl/server";
import { CalendarClock } from "lucide-react";
import { db } from "@/server/db";
import { fmtDisplayDate } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VisitScheduleUpload } from "./VisitScheduleUpload";

/** «Πρόγραμμα επισκέψεων γονέων»: upload it, and see what the last upload left unmatched. */
export async function VisitScheduleCard() {
  const t = await getTranslations("visitHours");
  const [total, unmatched, latest] = await Promise.all([
    db.visitHour.count(),
    db.visitHour.findMany({ where: { staffProfileId: null }, select: { fileName: true }, orderBy: { sortOrder: "asc" } }),
    db.visitHour.findFirst({ select: { createdAt: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-slate-400" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {latest && (
          <p className="text-sm text-slate-600">
            {t("currentState", { total, date: fmtDisplayDate(latest.createdAt) })}
          </p>
        )}
        {unmatched.length > 0 && (
          <p className="text-sm text-amber-700">
            {t("currentUnmatched", { count: unmatched.length })}: {unmatched.map((u) => u.fileName).join(", ")}
          </p>
        )}
        <VisitScheduleUpload />
      </CardContent>
    </Card>
  );
}
