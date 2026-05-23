import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarRange, Plus, Users } from "lucide-react";
import { utcMidnight, localDateStr } from "@/lib/dates";

export default async function ActivitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ past?: string }>;
}) {
  const { locale } = await params;
  const { past: pastParam } = await searchParams;
  const showPast = pastParam === "1";

  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const todayStr = localDateStr();
  const today = utcMidnight(todayStr);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const [todayActivities, upcoming, past] = await Promise.all([
    db.activity.findMany({
      where: { date: today },
      include: {
        filer: { include: { user: { select: { name: true } } } },
        _count: { select: { participants: true } },
      },
      orderBy: { startPeriod: "asc" },
    }),
    db.activity.findMany({
      where: { date: { gt: today, lte: nextWeek } },
      include: {
        filer: { include: { user: { select: { name: true } } } },
        _count: { select: { participants: true } },
      },
      orderBy: [{ date: "asc" }, { startPeriod: "asc" }],
    }),
    db.activity.findMany({
      where: { date: { lt: today } },
      include: {
        filer: { include: { user: { select: { name: true } } } },
        _count: { select: { participants: true } },
      },
      orderBy: [{ date: "desc" }, { startPeriod: "asc" }],
    }),
  ]);

  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function periodRange(s: number, e: number) {
    return s === e ? `Period ${s}` : `Periods ${s}–${e}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Activities</h2>
          <p className="text-slate-500 text-sm mt-1">School activities during class hours</p>
        </div>
        <Link
          href={`/${locale}/teacher/activities/new`}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          New Activity
        </Link>
      </div>

      {/* Today */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Today</CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-slate-50">
          {todayActivities.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">No activities scheduled for today</p>
          ) : (
            todayActivities.map((a) => (
              <Link
                key={a.id}
                href={`/${locale}/teacher/activities/${a.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <CalendarRange className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900">{a.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {periodRange(a.startPeriod, a.endPeriod)}
                    {a.location && ` · ${a.location}`}
                    {" · "}{a.filer.user.name}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-sm text-slate-500 flex-shrink-0">
                  <Users className="w-4 h-4" />
                  {a._count.participants}
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Next 7 Days</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-50">
            {upcoming.map((a) => (
              <div key={a.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 text-center flex-shrink-0">
                  <p className="text-xs font-medium text-slate-400 uppercase">{DOW[a.date.getDay()]}</p>
                  <p className="text-lg font-bold text-slate-700 leading-tight">{a.date.getDate()}</p>
                </div>
                <Link
                  href={`/${locale}/teacher/activities/${a.id}`}
                  className="flex-1 min-w-0 hover:underline"
                >
                  <p className="font-medium text-slate-900">{a.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {periodRange(a.startPeriod, a.endPeriod)}
                    {a.location && ` · ${a.location}`}
                    {" · "}{a.filer.user.name}
                  </p>
                </Link>
                <div className="flex items-center gap-1 text-sm text-slate-500 flex-shrink-0">
                  <Users className="w-4 h-4" />
                  {a._count.participants}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Past */}
      <div>
        <Link
          href={showPast ? `/${locale}/teacher/activities` : `/${locale}/teacher/activities?past=1`}
          className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <span>{showPast ? "Hide" : "Show"} past activities</span>
          {past.length > 0 && !showPast && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {past.length}
            </span>
          )}
        </Link>

        {showPast && past.length > 0 && (
          <Card className="mt-3">
            <CardContent className="p-0 divide-y divide-slate-50">
              {past.map((a) => {
                const dateLabel = a.date.toLocaleDateString("el-GR", { day: "numeric", month: "short" });
                return (
                  <Link
                    key={a.id}
                    href={`/${locale}/teacher/activities/${a.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors opacity-75 hover:opacity-100"
                  >
                    <div className="w-10 text-center flex-shrink-0">
                      <p className="text-xs font-medium text-slate-400 uppercase">{DOW[a.date.getDay()]}</p>
                      <p className="text-sm font-bold text-slate-500 leading-tight">{dateLabel}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-700">{a.name}</p>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {periodRange(a.startPeriod, a.endPeriod)}
                        {a.location && ` · ${a.location}`}
                        {" · "}{a.filer.user.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-slate-400 flex-shrink-0">
                      <Users className="w-4 h-4" />
                      {a._count.participants}
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}

        {showPast && past.length === 0 && (
          <p className="mt-3 text-sm text-slate-400">No past activities.</p>
        )}
      </div>
    </div>
  );
}
