import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { getNow, utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, GraduationCap, Bell, UserX } from "lucide-react";
import Link from "next/link";

export default async function OfficeDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const todayStr = localDateStr();
  const today = utcMidnight(todayStr);
  const now = getNow();
  const dateLabel = fmtDisplayDate(now);

  const [absentsToday, unreadNotices] = await Promise.all([
    db.attendance.count({
      where: { date: today, OR: [{ status: "ABSENT" }, { isAutoAbsent: true }] },
    }),
    db.notice.count({ where: { urgent: true } }),
  ]);

  const stats = [
    { title: "Absences Today",       value: absentsToday,   icon: UserX,         bg: "bg-red-50",     color: "text-red-600",     href: `/${locale}/office/attendance` },
    { title: "Unread Notifications", value: unreadNotices,  icon: Bell,          bg: "bg-amber-50",   color: "text-amber-600",   href: `/${locale}/office/noticeboard` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Office</h2>
        <p className="text-slate-500 mt-1">{dateLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.title} href={stat.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">{stat.title}</CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bg}`}>
                    <Icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Access</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link
            href={`/${locale}/office/attendance`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            <ClipboardList className="w-4 h-4" />
            Today&apos;s Attendance
          </Link>
          <Link
            href={`/${locale}/office/students`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            <GraduationCap className="w-4 h-4" />
            Student Records
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
