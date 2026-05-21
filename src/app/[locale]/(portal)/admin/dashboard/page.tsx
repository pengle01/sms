import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, AlertTriangle, Bell, Users } from "lucide-react";
import { utcMidnight } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";

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

  const today = utcMidnight();

  const [absentsToday, pendingReferrals, unreadNotices, totalStudents] =
    await Promise.all([
      db.attendance.count({
        where: {
          date: today,
          OR: [{ status: "ABSENT" }, { isAutoAbsent: true }],
        },
      }),
      db.referral.count({ where: { status: "PENDING" } }),
      db.notice.count({ where: { urgent: true } }),
      db.studentProfile.count(),
    ]);

  const recentReferrals = await db.referral.findMany({
    where: { status: "PENDING" },
    include: {
      student: { include: { user: { select: { name: true } } } },
      filer: { include: { user: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const stats = [
    {
      title: t("absentsToday"),
      value: absentsToday,
      icon: ClipboardList,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      title: t("pendingReferrals"),
      value: pendingReferrals,
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      title: t("unreadNotices"),
      value: unreadNotices,
      icon: Bell,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Total Students",
      value: totalStudents,
      icon: Users,
      color: "text-green-600",
      bg: "bg-green-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          {t("welcome", { name: session.user.name ?? "" })}
        </h2>
        <p className="text-slate-500 mt-1">{t("today")}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  {stat.title}
                </CardTitle>
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
          <CardTitle className="text-base">Recent Pending Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          {recentReferrals.length === 0 ? (
            <p className="text-slate-400 text-sm">{tCommon("noData")}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentReferrals.map((r: typeof recentReferrals[number]) => (
                <div key={r.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {r.student.user.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                      {r.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-xs text-slate-400">
                      {r.filer.user.name}
                    </span>
                    <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                      Pending
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
