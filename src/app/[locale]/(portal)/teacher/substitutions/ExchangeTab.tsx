import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftRight } from "lucide-react";
import { db } from "@/server/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { slotTeacherName } from "@/lib/staffName";
import { periodLabel } from "@/lib/periods";
import { findExchanges, slotTeacherKey } from "@/lib/periodExchange";
import { cn } from "@/lib/utils";

/**
 * «Ανταλλαγή περιόδων»: every lesson of the viewer's weekly timetable with the
 * other teachers' lessons to the same group it could be swapped with (both
 * teachers free at the other's period). Information only.
 */
export async function ExchangeTab({
  locale,
  staffId,
  scheduleName,
  showAll,
  baseHref,
}: {
  locale: string;
  staffId: string;
  scheduleName: string | null;
  showAll: boolean;
  baseHref: string;
}) {
  const t = await getTranslations("substitutions");

  // The whole weekly timetable: the other teachers' free periods are needed too.
  const slots = await db.timetableSlot.findMany({
    select: {
      id: true,
      groupId: true,
      dayOfWeek: true,
      period: true,
      staffId: true,
      staffName: true,
      room: true,
      group: { select: { name: true } },
      course: { select: { name: true } },
      staff: { select: { scheduleName: true, user: { select: { name: true } } } },
    },
  });

  const myKeys = [slotTeacherKey({ staffId, staffName: null })!];
  if (scheduleName) myKeys.push(slotTeacherKey({ staffId: null, staffName: scheduleName })!);
  const all = findExchanges(myKeys, slots);
  const possible = all.filter((x) => x.options.length > 0);
  const rows = showAll ? all : possible;

  const when = (dow: number, period: number) =>
    `${t(`weekday${dow}` as Parameters<typeof t>[0])} ${periodLabel(period, locale)}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-emerald-600" />
            {t("tabExchange")}
          </CardTitle>
          {all.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                {t("exchangeCount", { count: possible.length })}
              </Badge>
              <Link
                href={showAll ? baseHref : `${baseHref}&all=1`}
                className="text-slate-500 underline hover:text-slate-800"
              >
                {showAll ? t("exchangeOnlyPossible") : t("exchangeShowAll")}
              </Link>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500">{t("exchangeIntro")}</p>
      </CardHeader>
      <CardContent className="p-0">
        {all.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">{t("exchangeNoLessons")}</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">{t("exchangeNone")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-2.5 w-56">{t("exchangeMine")}</th>
                  <th className="px-4 py-2.5">{t("exchangeWith")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map(({ mine, options }, idx) => (
                  <tr key={mine.id} className={cn("align-top", idx % 2 === 1 && "bg-slate-50")}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-900">{when(mine.dayOfWeek, mine.period)}</p>
                      <p className="text-xs text-slate-500">
                        {mine.group.name} · {mine.course.name}
                        {mine.room ? ` · ${mine.room}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      {options.length === 0 ? (
                        <span className="text-xs text-slate-400">{t("exchangeNone")}</span>
                      ) : (
                        <ul className="flex flex-wrap gap-1.5">
                          {options.map((o) => (
                            <li
                              key={o.id}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900"
                            >
                              <span className="font-semibold">{when(o.dayOfWeek, o.period)}</span>
                              {" · "}
                              {slotTeacherName(o)}
                              <span className="text-emerald-700"> ({o.course.name})</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
