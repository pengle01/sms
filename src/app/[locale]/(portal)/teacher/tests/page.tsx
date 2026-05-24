import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, CalendarCheck } from "lucide-react";
import { utcMidnight, localDateStr } from "@/lib/dates";
import { DeleteTestButton } from "./DeleteTestButton";

export default async function TeacherTestsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Tests</h2>
        <p className="text-slate-400 text-sm">No staff profile found.</p>
      </div>
    );
  }

  const today = utcMidnight(localDateStr());
  const thirtyDaysAgo = new Date(today);
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

  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const formatDate = (d: Date) =>
    `${DOW[d.getDay()]} ${d.toLocaleDateString("el-GR", { day: "numeric", month: "short" })}`;

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
          {t.type === "BIG" ? "Big · 45 min" : "Small · 20 min"}
        </Badge>
      </td>
      <td className="px-3 py-3">
        {t.date >= today && <DeleteTestButton testId={t.id} />}
      </td>
    </tr>
  );

  const TestTable = ({ rows, faded }: { rows: typeof tests; faded?: boolean }) => (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Subject</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Group</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Period</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Type</th>
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
          <h2 className="text-2xl font-bold text-slate-900">Tests</h2>
          <p className="text-slate-500 text-sm mt-1">Upcoming and recent test schedule</p>
        </div>
        <Link
          href={`/${locale}/teacher/tests/new`}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          Schedule test
        </Link>
      </div>

      {upcoming.length === 0 && past.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No tests scheduled</p>
          <p className="text-sm mt-1">Use the button above to schedule a test</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Upcoming</p>
          <TestTable rows={upcoming} />
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Past 30 days</p>
          <TestTable rows={past} faded />
        </div>
      )}
    </div>
  );
}
