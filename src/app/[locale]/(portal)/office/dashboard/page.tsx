import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { getTranslations } from "next-intl/server";
import { getActiveAnnouncements } from "@/server/announcements";
import { AnnouncementsCard } from "@/components/announcements/AnnouncementsCard";
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
  const t = await getTranslations("officeDashboard");
  const tAttendance = await getTranslations("attendance");
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const todayStr = localDateStr();
  const today = utcMidnight(todayStr);
  const now = getNow();
  const dateLabel = fmtDisplayDate(now);

  const [absentsToday, unreadNotifications, announcements] = await Promise.all([
    db.attendance.count({
      where: { date: today, OR: [{ status: "ABSENT" }, { isAutoAbsent: true }] },
    }),
    // This reader's own unread notifications — the same thing the card links to.
    // It used to count urgent Notices, which are a different model, are never
    // marked read, and are not shown on /office/notifications at all.
    db.notification.count({ where: { userId: session.user.id, read: false } }),
    // The secretary now posts announcements, so she sees the live ones here too.
    getActiveAnnouncements(today),
  ]);

  const stats = [
    { title: t("absencesToday"),        value: absentsToday,         icon: UserX, bg: "bg-red-50",   color: "text-red-600",   href: `/${locale}/office/attendance` },
    { title: t("unreadNotifications"),  value: unreadNotifications,  icon: Bell,  bg: "bg-amber-50", color: "text-amber-600", href: `/${locale}/office/notifications` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 mt-1">{dateLabel}</p>
      </div>

      <AnnouncementsCard announcements={announcements} />

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
          <CardTitle className="text-base">{t("quickAccess")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link
            href={`/${locale}/office/attendance`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            <ClipboardList className="w-4 h-4" />
            {tAttendance("markAttendance")}
          </Link>
          <Link
            href={`/${locale}/office/students`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            <GraduationCap className="w-4 h-4" />
            {t("studentRecords")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
