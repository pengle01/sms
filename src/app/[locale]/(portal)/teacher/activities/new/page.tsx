import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { createActivity } from "../actions";
import { localDateStr } from "@/lib/dates";

export default async function NewActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    name?: string;
    date?: string;
    startPeriod?: string;
    endPeriod?: string;
    location?: string;
    grade?: string;
    groupId?: string;
  }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const { name, date, startPeriod, endPeriod, location, grade, groupId } =
    await searchParams;

  const todayStr = localDateStr();
  const gradeNum = grade ? parseInt(grade) : undefined;

  // Details are "confirmed" once they've been saved to the URL via the GET form
  const detailsConfirmed = !!(name && date);

  const allGroups = await db.group.findMany({
    where: { students: { some: {} } },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
  });
  const filteredGroups = gradeNum
    ? allGroups.filter((g) => g.grade === gradeNum)
    : [];

  const students =
    groupId && detailsConfirmed
      ? await db.studentProfile.findMany({
          where: { groupId, user: { isActive: true } },
          include: { user: { select: { name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : [];

  // Build base URL params (activity details only, no grade/groupId)
  function detailParams() {
    const p = new URLSearchParams();
    if (name) p.set("name", name);
    if (date) p.set("date", date);
    if (startPeriod) p.set("startPeriod", startPeriod);
    if (endPeriod) p.set("endPeriod", endPeriod);
    if (location) p.set("location", location);
    return p;
  }

  function yearUrl(g: number) {
    const p = detailParams();
    p.set("grade", String(g));
    return `?${p.toString()}`;
  }

  function groupUrl(gId: string) {
    const p = detailParams();
    if (gradeNum) p.set("grade", String(gradeNum));
    p.set("groupId", gId);
    return `?${p.toString()}`;
  }

  const periods = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/teacher/activities`}
          className="text-slate-500 hover:text-slate-700"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">New Activity</h2>
      </div>

      {/* ── Step 1: Activity details (GET form) ───────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Step 1 — Activity Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form method="GET" className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Activity name
              </label>
              <input
                name="name"
                required
                defaultValue={name}
                placeholder="e.g. Drama Club Rehearsal"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Date</label>
              <input
                type="date"
                name="date"
                required
                defaultValue={date ?? todayStr}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Start period
                </label>
                <select
                  name="startPeriod"
                  defaultValue={startPeriod ?? "1"}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      Period {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  End period
                </label>
                <select
                  name="endPeriod"
                  defaultValue={endPeriod ?? "1"}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      Period {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Location{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                name="location"
                defaultValue={location}
                placeholder="e.g. Hall A, Gym, Off-site"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              className="h-9 px-5 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800"
            >
              Save Details →
            </button>
          </form>
        </CardContent>
      </Card>

      {/* ── Step 2: Select students ──────────────────────────────────── */}
      <Card className={!detailsConfirmed ? "opacity-50 pointer-events-none" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Step 2 — Select Students</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!detailsConfirmed && (
            <p className="text-sm text-slate-400">
              Complete Step 1 first to enable student selection.
            </p>
          )}

          {detailsConfirmed && (
            <>
              {/* Year */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Year
                </p>
                <div className="flex gap-2">
                  {[1, 2, 3].map((g) => (
                    <Link
                      key={g}
                      href={yearUrl(g)}
                      className={cn(
                        "h-9 px-5 rounded-lg text-sm font-medium transition-colors border",
                        gradeNum === g
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
                      )}
                    >
                      Year {g}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Homegroup */}
              {gradeNum && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Homegroup
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {filteredGroups.map((g) => (
                      <Link
                        key={g.id}
                        href={groupUrl(g.id)}
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

              {/* Students */}
              {groupId && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Students in{" "}
                    {allGroups.find((g) => g.id === groupId)?.name}
                  </p>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {students.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-slate-400">
                        No students in this group
                      </p>
                    ) : (
                      students.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer"
                          id={`student-${s.id}`}
                        >
                          <input
                            type="checkbox"
                            form="create-activity-form"
                            name="studentId"
                            value={s.id}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm font-medium text-slate-900">
                            {s.user.name}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Create form (POST) — always rendered but hidden until step 1 done ── */}
      {detailsConfirmed && (
        <form id="create-activity-form" action={createActivity}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="name" value={name ?? ""} />
          <input type="hidden" name="date" value={date ?? todayStr} />
          <input type="hidden" name="startPeriod" value={startPeriod ?? "1"} />
          <input type="hidden" name="endPeriod" value={endPeriod ?? "1"} />
          <input type="hidden" name="location" value={location ?? ""} />

          <div className="flex gap-3">
            <button
              type="submit"
              className="h-10 px-6 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
            >
              Create Activity
            </button>
            <Link
              href={`/${locale}/teacher/activities`}
              className="h-10 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 inline-flex items-center"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
