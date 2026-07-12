import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, CalendarCheck } from "lucide-react";
import { utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { getActiveTermInfo } from "@/lib/schoolConfig";
import { getTranslations } from "next-intl/server";
import { DeleteTestButton } from "./DeleteTestButton";

export default async function TeacherTestsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const t = await getTranslations("calendar");
  const tTests = await getTranslations("tests");
  const tGrades = await getTranslations("grades");
  const localeTag = locale === "el" ? "el-GR" : "en-US";

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">{tTests("title")}</h2>
        <p className="text-slate-400 text-sm">{tTests("noStaff")}</p>
      </div>
    );
  }

  const today = utcMidnight(localDateStr());
  const thirtyDaysAgo = new Date(today);
  const activeTerm = await getActiveTermInfo(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const tests = await db.testSchedule.findMany({
    where: {
      staffId: staff.id,
      date: { gte: thirtyDaysAgo },
    },
    include: {
      course: { select: { name: true } },
      group: { select: { name: true, grade: true } },
    },
    orderBy: [{ date: "asc" }, { period: "asc" }],
  });

  const upcoming = tests.filter((t) => t.date >= today);
  const past = tests.filter((t) => t.date < today);

  const DOW = tTests.raw("dow") as string[];

  const formatDate = (d: Date) => `${DOW[d.getUTCDay()]} ${fmtDisplayDate(d)}`;

  const TestRow = ({ t }: { t: (typeof tests)[number] }) => (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="px-5 py-3 text-sm font-medium text-slate-900">
        {formatDate(t.date)}
      </td>
      <td className="px-5 py-3 text-sm text-slate-600">{t.course.name}</td>
      <td className="px-5 py-3 text-sm text-slate-500">{t.group.name}</td>
      <td className="px-5 py-3 text-xs text-slate-400">
        {t.periodCount > 1 ? `P${t.period}–${t.period + t.periodCount - 1}` : `P${t.period}`}
      </td>
      <td className="px-5 py-3">
        <Badge
          variant="outline"
          className={t.type === "BIG"
            ? "text-xs bg-slate-800 text-white border-slate-800"
            : "text-xs bg-slate-100 text-slate-600 border-slate-200"}
        >
          {t.type === "BIG" ? tTests("typeBig") : tTests("typeSmall")}
        </Badge>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/teacher/tests/${t.id}/grades`}
            className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
          >
            {tTests("grades")}
          </Link>
          {t.date >= today && <DeleteTestButton testId={t.id} />}
        </div>
      </td>
    </tr>
  );

  const TestTable = ({ rows, faded }: { rows: typeof tests; faded?: boolean }) => (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("colDate")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("colSubject")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("colGroup")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("colPeriod")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("colType")}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className={faded ? "opacity-60" : ""}>
            {rows.map((t) => <TestRow key={t.id} t={t} />)}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{tTests("title")}</h2>
          {activeTerm ? (
            <p className="text-slate-500 text-sm mt-1">
              {t("currentTerm", { label: tGrades(activeTerm.term === "TERM1" ? "term1" : "term2") })}
              {" · "}
              {t("testDeadlineNote", { date: fmtDisplayDate(activeTerm.testDeadline) })}
            </p>
          ) : (
            <p className="text-slate-400 text-sm mt-1">{t("noCurrentTerm")}</p>
          )}
        </div>
        <Link
          href={`/${locale}/teacher/tests/new`}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          {tTests("scheduleTest")}
        </Link>
      </div>

      {upcoming.length === 0 && past.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{tTests("noTests")}</p>
          <p className="text-sm mt-1">{tTests("noTestsHint")}</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("upcoming")}</p>
          <TestTable rows={upcoming} />
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("past30")}</p>
          <TestTable rows={past} faded />
        </div>
      )}
    </div>
  );
}
