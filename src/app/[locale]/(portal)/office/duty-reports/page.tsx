import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Printer } from "lucide-react";
import { localDateStr } from "@/lib/dates";
import { isRealDate } from "@/lib/substitutionImport";
import { loadBreakDutyDay } from "@/server/breakDuty";
import { BreakDutyReport } from "@/components/breakDuty/BreakDutyReport";
import { DateFilter } from "./DateFilter";

/** «Αναφορές εφημερίας»: the secretaries read each day's break-duty report. */
export default async function OfficeDutyReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { locale } = await params;
  const { date: dateParam } = await searchParams;
  const t = await getTranslations("breakDuty");
  const today = localDateStr();
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && isRealDate(dateParam) ? dateParam : today;
  const day = await loadBreakDutyDay(date);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t("officeTitle")}</h2>
          <p className="text-slate-500 text-sm mt-1">{t("officeIntro")}</p>
        </div>
        <div className="flex items-center gap-2">
          <DateFilter value={date} max={today} />
          <Link
            href={`/${locale}/office/duty-reports/${date}/print?auto=1`}
            target="_blank"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50"
          >
            <Printer className="w-4 h-4" />
            {t("printReport")}
          </Link>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 overflow-x-auto">
        <BreakDutyReport day={day} />
      </div>
    </div>
  );
}
