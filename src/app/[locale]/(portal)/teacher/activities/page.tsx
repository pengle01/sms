import { db } from "@/server/db";
import { staffDisplayName } from "@/lib/staffName";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Pencil } from "lucide-react";
import { utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { DeleteActivityButton } from "./DeleteActivityButton";

export default async function ActivitiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const today = utcMidnight(localDateStr());
  // Every activity — the complete list teachers can browse.
  const all = await db.activity.findMany({
    include: {
      filer: { include: { user: { select: { name: true } } } },
      _count: { select: { participants: true } },
    },
    orderBy: [{ date: "desc" }, { startPeriod: "asc" }],
  });

  // Which of these activities the current teacher filed — so they can spot and
  // edit their own at a glance, regardless of date.
  const myStaff = await db.staffProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  const myStaffId = myStaff?.id ?? null;
  const mine = myStaffId ? all.filter((a) => a.filerId === myStaffId) : [];

  const DOW = ["Κυρ", "Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ"];

  function periodRange(s: number, e: number) {
    return s === e ? `Περίοδος ${s}` : `Περίοδοι ${s}–${e}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Δραστηριότητες</h2>
          <p className="text-slate-500 text-sm mt-1">Σχολικές δραστηριότητες κατά τη διάρκεια των μαθημάτων</p>
        </div>
        <Link
          href={`/${locale}/teacher/activities/new`}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          Νέα Δραστηριότητα
        </Link>
      </div>

      {/* My activities — the ones this teacher filed (any date), with quick edit */}
      {mine.length > 0 && (
        <Card className="border-emerald-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
              <Pencil className="w-4 h-4" />
              Οι δραστηριότητές μου ({mine.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-slate-50">
            {mine.map((a) => {
              const dateLabel = fmtDisplayDate(a.date);
              const isPast = a.date < today;
              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-4 px-5 py-4 ${isPast ? "opacity-75" : ""}`}
                >
                  <div className="w-16 text-center flex-shrink-0">
                    <p className="text-xs font-medium text-slate-400 uppercase">{DOW[a.date.getDay()]}</p>
                    <p className="text-sm font-bold text-slate-600 leading-tight">{dateLabel}</p>
                  </div>
                  <Link href={`/${locale}/teacher/activities/${a.id}`} className="flex-1 min-w-0 hover:underline">
                    <p className="font-medium text-slate-900">{a.name}</p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {periodRange(a.startPeriod, a.endPeriod)}
                      {a.location && ` · ${a.location}`}
                    </p>
                  </Link>
                  <div className="flex items-center gap-1 text-sm text-slate-500 flex-shrink-0">
                    <Users className="w-4 h-4" />
                    {a._count.participants}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/${locale}/teacher/activities/${a.id}?edit=1`}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Επεξεργασία
                    </Link>
                    <DeleteActivityButton activityId={a.id} locale={locale} compact />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* All activities — the complete list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Όλες οι δραστηριότητες ({all.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-slate-50">
          {all.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">Δεν υπάρχουν δραστηριότητες</p>
          ) : (
            all.map((a) => {
              const dateLabel = fmtDisplayDate(a.date);
              const isPast = a.date < today;
              return (
                <Link
                  key={a.id}
                  href={`/${locale}/teacher/activities/${a.id}`}
                  className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors ${isPast ? "opacity-75 hover:opacity-100" : ""}`}
                >
                  <div className="w-16 text-center flex-shrink-0">
                    <p className="text-xs font-medium text-slate-400 uppercase">{DOW[a.date.getDay()]}</p>
                    <p className="text-sm font-bold text-slate-600 leading-tight">{dateLabel}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 flex items-center gap-2">
                      {a.name}
                      {a.filerId === myStaffId && (
                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                          Δικό σας
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {periodRange(a.startPeriod, a.endPeriod)}
                      {a.location && ` · ${a.location}`}
                      {" · "}{staffDisplayName(a.filer)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-slate-500 flex-shrink-0">
                    <Users className="w-4 h-4" />
                    {a._count.participants}
                  </div>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
