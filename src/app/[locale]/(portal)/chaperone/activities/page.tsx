import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Backpack, Users, MapPin, Calendar } from "lucide-react";
import { fmtDisplayDate } from "@/lib/dates";

export default async function ChaperoneActivitiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(`/${locale}/login`);

  const assignments = await db.activityChaperone.findMany({
    where: { userId: session.user.id },
    include: {
      activity: {
        include: {
          participants: {
            include: {
              student: {
                include: { user: { select: { name: true, isActive: true } } },
              },
            },
            orderBy: { student: { user: { name: "asc" } } },
          },
        },
      },
    },
    orderBy: { activity: { date: "asc" } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Οι Δραστηριότητές μου</h2>
        <p className="text-slate-500 mt-1">Δραστηριότητες στις οποίες έχετε οριστεί συνοδός.</p>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Backpack className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Δεν σας έχει ανατεθεί καμία δραστηριότητα ακόμη.</p>
            <p className="text-slate-400 text-xs mt-1">Ένας διαχειριστής θα σας ορίσει σε δραστηριότητα όταν χρειαστεί.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {assignments.map(({ activity }) => (
            <Card key={activity.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <CardTitle className="text-base">{activity.name}</CardTitle>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    Ώρες {activity.startPeriod}–{activity.endPeriod}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-slate-500 mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {fmtDisplayDate(activity.date)}
                  </span>
                  {activity.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {activity.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {activity.participants.length} μαθητές
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-slate-100">
                  {activity.participants.map(({ student }) => (
                    <div key={student.id} className="py-2 flex items-center justify-between">
                      <span className="text-sm text-slate-700">{student.user?.name ?? "—"}</span>
                      {!student.user.isActive && (
                        <Badge variant="outline" className="text-xs text-slate-400">Ανενεργός</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
