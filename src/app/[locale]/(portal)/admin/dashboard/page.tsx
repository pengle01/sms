import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, AlertTriangle, Bell, Users, CheckCircle2 } from "lucide-react";
import { getNow, utcMidnight } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const tReferrals = await getTranslations("referrals");

  const today = utcMidnight();
  const now = getNow();
  const todayDow = now.getDay();
  const isWeekend = todayDow === 0 || todayDow === 6;

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });

  const [absentsToday, pendingReferrals, unreadNotices, totalStudents, allSlots, markedRaw] =
    await Promise.all([
      db.attendance.count({
        where: { date: today, OR: [{ status: "ABSENT" }, { isAutoAbsent: true }] },
      }),
      db.referral.count({ where: { isDraft: false, students: { some: { status: "PENDING" } } } }),
      db.notice.count({ where: { urgent: true } }),
      db.studentProfile.count(),
      staff && !isWeekend
        ? db.timetableSlot.findMany({
            where: { staffId: staff.id },
            include: { course: true, group: true },
            orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
          })
        : Promise.resolve([]),
      staff && !isWeekend
        ? db.attendance.findMany({
            where: { date: today, timetableSlot: { staffId: staff.id } },
            select: { timetableSlotId: true },
            distinct: ["timetableSlotId"],
          })
        : Promise.resolve([]),
    ]);

  const todaySlots = allSlots.filter((s) => s.dayOfWeek === todayDow);
  const markedSlotIds = new Set(markedRaw.map((r) => r.timetableSlotId));

  const maxPeriod = allSlots.reduce((m, s) => Math.max(m, s.period), 0);
  const slotByPeriod = Object.fromEntries(todaySlots.map((s) => [s.period, s]));

  const recentReferrals = await db.referral.findMany({
    where: { isDraft: false, students: { some: { status: "PENDING" } } },
    include: {
      students: { include: { student: { include: { user: { select: { name: true } } } } } },
      filer: { include: { user: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const stats = [
    { title: t("absentsToday"),     value: absentsToday,    icon: ClipboardList, color: "text-red-600",     bg: "bg-red-50"     },
    { title: t("pendingReferrals"), value: pendingReferrals, icon: AlertTriangle, color: "text-amber-600",   bg: "bg-amber-50"   },
    { title: t("unreadNotices"),    value: unreadNotices,   icon: Bell,          color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: t("totalStudents"),    value: totalStudents,   icon: Users,         color: "text-green-600",   bg: "bg-green-50"   },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          {t("welcome", { name: session.user?.name ?? "" })}
        </h2>
        <p className="text-slate-500 mt-1">{t("today")}</p>
      </div>

      {/* Today's schedule — only for staff with a linked profile */}
      {staff && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("todaySchedule")}</CardTitle>
              <Link
                href={`/${locale}/admin/attendance/schedule`}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                {t("fullSchedule")}
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isWeekend ? (
              <p className="px-5 py-6 text-sm text-slate-400">{t("noSchoolToday")}</p>
            ) : maxPeriod === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">{t("noTimetableSlots")}</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((period) => {
                  const slot = slotByPeriod[period];
                  const marked = slot ? markedSlotIds.has(slot.id) : false;

                  if (!slot) {
                    return (
                      <div key={period} className="flex items-center gap-4 px-5 py-3">
                        <span className="w-5 flex-shrink-0 text-center text-sm font-semibold text-slate-200">
                          {period}
                        </span>
                        <span className="text-sm italic text-slate-300">{t("freePeriod")}</span>
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={period}
                      href={`/${locale}/admin/attendance/mark?groupId=${slot.groupId}&period=${slot.period}`}
                      className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50 ${marked ? "bg-emerald-50/40" : ""}`}
                    >
                      <span className="w-5 flex-shrink-0 text-center text-sm font-bold text-slate-400">
                        {period}
                      </span>
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">{slot.course.name}</span>
                        <span className="text-sm text-slate-400">{slot.group.name}</span>
                        {slot.room && (
                          <span className="text-xs text-slate-400 font-mono">{t("room", { room: slot.room })}</span>
                        )}
                      </div>
                      {marked ? (
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                      ) : (
                        <span className="text-xs font-medium text-emerald-600 flex-shrink-0">
                          {t("markAttendance")}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
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
          );
        })}
      </div>

      {/* Recent referrals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("recentReferrals")}</CardTitle>
        </CardHeader>
        <CardContent>
          {recentReferrals.length === 0 ? (
            <p className="text-slate-400 text-sm">{tCommon("noData")}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentReferrals.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {r.students.map((rs) => rs.student.user?.name).filter(Boolean).join(", ") || "—"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{r.description}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-xs text-slate-400">{r.filer.user?.name}</span>
                    <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                      {tReferrals("pending")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
