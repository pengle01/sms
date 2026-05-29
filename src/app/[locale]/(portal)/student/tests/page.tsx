import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck } from "lucide-react";
import { utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { getTranslations } from "next-intl/server";

function gradeColor(v: number) {
  if (v >= 17) return "text-green-700 font-bold";
  if (v >= 13) return "text-emerald-700 font-bold";
  if (v >= 10) return "text-amber-700 font-bold";
  return "text-red-700 font-bold";
}

export default async function StudentTestsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const student = await db.studentProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      subjectGroups: { select: { groupId: true } },
    },
  });
  if (!student) redirect(`/${locale}/login`);

  const t = await getTranslations("myTests");
  const tShared = await getTranslations("tests");

  const allGroupIds = [
    ...new Set([
      ...(student.groupId ? [student.groupId] : []),
      ...student.subjectGroups.map((sg) => sg.groupId),
    ]),
  ];

  const today = utcMidnight();

  const [tests, gradeRows] = await Promise.all([
    allGroupIds.length > 0
      ? db.testSchedule.findMany({
          where: { groupId: { in: allGroupIds } },
          include: { course: { select: { name: true } }, group: { select: { name: true } } },
          orderBy: [{ date: "asc" }, { period: "asc" }],
        })
      : Promise.resolve([]),
    db.testGrade.findMany({
      where: { studentId: student.id },
      select: { testScheduleId: true, value: true },
    }),
  ]);

  const gradeMap = new Map(gradeRows.map((g) => [g.testScheduleId, g.value]));

  const upcoming = tests.filter((t) => t.date >= today);
  const past = tests.filter((t) => t.date < today);

  const DOW = tShared.raw("dow") as string[];
  const formatDate = (d: Date) => `${DOW[d.getUTCDay()]} ${fmtDisplayDate(d)}`;
  const fmtPeriod = (period: number, periodCount: number) =>
    periodCount > 1 ? `P${period}–${period + periodCount - 1}` : `P${period}`;

  const TypeBadge = ({ type }: { type: "BIG" | "SMALL" }) => (
    <Badge
      variant="outline"
      className={
        type === "BIG"
          ? "text-xs bg-slate-800 text-white border-slate-800"
          : "text-xs bg-slate-100 text-slate-600 border-slate-200"
      }
    >
      {type === "BIG" ? t("typeBig") : t("typeSmall")}
    </Badge>
  );

  const UpcomingTable = ({ rows }: { rows: typeof tests }) => (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[460px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colDate")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colSubject")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colPeriod")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colType")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{formatDate(row.date)}</td>
                <td className="px-5 py-3 text-slate-700">{row.course.name}</td>
                <td className="px-5 py-3 text-xs text-slate-400">{fmtPeriod(row.period, row.periodCount)}</td>
                <td className="px-5 py-3"><TypeBadge type={row.type} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  const PastTable = ({ rows }: { rows: typeof tests }) => (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colDate")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colSubject")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colPeriod")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colType")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colGrade")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row) => {
              const grade = gradeMap.get(row.id);
              return (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">{formatDate(row.date)}</td>
                  <td className="px-5 py-3 text-slate-700">{row.course.name}</td>
                  <td className="px-5 py-3 text-xs text-slate-400">{fmtPeriod(row.period, row.periodCount)}</td>
                  <td className="px-5 py-3"><TypeBadge type={row.type} /></td>
                  <td className="px-5 py-3">
                    {grade != null ? (
                      <span className={`text-base ${gradeColor(Number(grade))}`}>
                        {Number(grade).toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
      </div>

      {upcoming.length === 0 && past.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <CalendarCheck className="w-12 h-12 mb-3 opacity-30" />
          <p>{t("noUpcoming")}</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("upcoming")}</p>
          <UpcomingTable rows={upcoming} />
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("past")}</p>
          <PastTable rows={past} />
        </div>
      )}
    </div>
  );
}
