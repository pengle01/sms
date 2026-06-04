import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck } from "lucide-react";
import { utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { getTranslations } from "next-intl/server";
import { periodLabel } from "@/lib/periods";

function gradeColor(v: number) {
  if (v >= 17) return "text-green-700 font-bold";
  if (v >= 13) return "text-emerald-700 font-bold";
  if (v >= 10) return "text-amber-700 font-bold";
  return "text-red-700 font-bold";
}

// The child's tests with their test marks — term marks live on the Grades page.
export default async function ParentChildTestsPage({
  params,
}: {
  params: Promise<{ locale: string; studentId: string }>;
}) {
  const { locale, studentId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  // Verify parent is linked to this student
  const parent = await db.parentProfile.findUnique({
    where: { userId: session.user.id },
    include: { children: true },
  });
  if (!parent || !parent.children.some((c) => c.studentProfileId === studentId)) {
    redirect(`/${locale}/parent/children`);
  }

  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { name: true } },
      group: { select: { name: true } },
      subjectGroups: { select: { groupId: true } },
    },
  });
  if (!student) redirect(`/${locale}/parent/children`);

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
  const upcoming = tests.filter((row) => row.date >= today);
  // Past tests newest-first — the latest marks on top
  const past = tests.filter((row) => row.date < today).reverse();

  const DOW = tShared.raw("dow") as string[];
  const formatDate = (d: Date) => `${DOW[d.getUTCDay()]} ${fmtDisplayDate(d)}`;
  const fmtPeriod = (period: number, periodCount: number) =>
    periodCount > 1
      ? `${periodLabel(period, locale)}–${period + periodCount - 1}`
      : periodLabel(period, locale);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{student.user?.name}</h2>
        <p className="text-slate-500 text-sm mt-1">
          {t("title")}
          {student.group?.name && ` · ${student.group.name}`}
        </p>
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
                  {upcoming.map((row) => (
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
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("past")}</p>
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
                  {past.map((row) => {
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
        </div>
      )}
    </div>
  );
}
