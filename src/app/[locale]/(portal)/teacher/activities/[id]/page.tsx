import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { addParticipants, removeParticipant } from "../actions";

export default async function ActivityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ grade?: string; groupId?: string }>;
}) {
  const { locale, id } = await params;
  const { grade, groupId } = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const activity = await db.activity.findUnique({
    where: { id },
    include: {
      filer: { include: { user: { select: { name: true } } } },
      participants: {
        include: {
          student: {
            include: {
              user: { select: { name: true } },
              group: true,
            },
          },
        },
        orderBy: { student: { user: { name: "asc" } } },
      },
    },
  });

  if (!activity) notFound();

  const gradeNum = grade ? parseInt(grade) : undefined;
  const participantIds = new Set(activity.participants.map((p) => p.studentId));

  const allGroups = await db.group.findMany({
    where: { students: { some: {} } },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
  });
  const filteredGroups = gradeNum
    ? allGroups.filter((g) => g.grade === gradeNum)
    : allGroups;

  const candidateStudents = groupId
    ? await db.studentProfile.findMany({
        where: {
          groupId,
          user: { isActive: true },
          id: { notIn: Array.from(participantIds) },
        },
        include: {
          user: { select: { name: true } },
          group: true,
        },
        orderBy: [{ group: { grade: "asc" } }, { group: { name: "asc" } }, { user: { name: "asc" } }],
      })
    : [];

  const dateLabel = activity.date.toLocaleDateString("el-GR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  function periodRange(s: number, e: number) {
    return s === e ? `Period ${s}` : `Periods ${s}–${e}`;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href={`/${locale}/teacher/activities`} className="text-slate-500 hover:text-slate-700 mt-1">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{activity.name}</h2>
          <p className="text-slate-500 text-sm mt-1">
            {dateLabel} · {periodRange(activity.startPeriod, activity.endPeriod)}
            {activity.location && ` · ${activity.location}`}
          </p>
          <p className="text-slate-400 text-xs mt-0.5">Organised by {activity.filer.user.name}</p>
        </div>
      </div>

      {/* Participants */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            Participants ({activity.participants.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {activity.participants.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No students added yet</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-50">
                {activity.participants.map((p) => (
                  <tr key={p.studentId} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      <Link
                        href={`/${locale}/teacher/students/${p.studentId}`}
                        className="hover:underline"
                      >
                        {p.student.user.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="outline" className="text-xs">{p.student.group?.name ?? "—"}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <form action={removeParticipant}>
                        <input type="hidden" name="activityId" value={id} />
                        <input type="hidden" name="studentId" value={p.studentId} />
                        <button
                          type="submit"
                          className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Remove"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Add students */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add Students</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Step 1 — Year */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Year</p>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3].map((g) => (
                <Link
                  key={g}
                  href={`?grade=${g}`}
                  className={cn(
                    "h-9 px-5 rounded-lg text-sm font-medium transition-colors border",
                    grade === String(g)
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
                  )}
                >
                  Year {g}
                </Link>
              ))}
            </div>
          </div>

          {/* Step 2 — Homegroup (shown only after year is chosen) */}
          {gradeNum && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Homegroup</p>
              <div className="flex gap-2 flex-wrap">
                {filteredGroups.map((g) => (
                  <Link
                    key={g.id}
                    href={`?grade=${gradeNum}&groupId=${g.id}`}
                    className={cn(
                      "h-9 px-5 rounded-lg text-sm font-medium transition-colors border",
                      groupId === g.id
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
                    )}
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Step 3 — Students (shown only after group is chosen) */}
          {groupId && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Students</p>
              <form action={addParticipants}>
                <input type="hidden" name="activityId" value={id} />
                {candidateStudents.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">
                    All students in this group are already added
                  </p>
                ) : (
                  <>
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto">
                      {candidateStudents.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            name="studentId"
                            value={s.id}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="flex-1 text-sm font-medium text-slate-900">{s.user.name}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="submit"
                      className="mt-3 h-9 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                    >
                      Add Selected
                    </button>
                  </>
                )}
              </form>
            </div>
          )}

          {!gradeNum && (
            <p className="text-sm text-slate-400">Select a year to get started</p>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
