import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, Printer, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSchoolYear } from "@/lib/schoolConfig";
import { ddkTotal, ddkRating, schoolYearLabel } from "@/lib/ddk";
import { fullAttendanceAwards } from "@/server/ddk";

// The ΔΔΚ coordinator's desk: pick a year + class, see every student's running
// total and rating for the school year, and print the year-end reports.
export default async function DdkOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ grade?: string; groupId?: string }>;
}) {
  const { locale } = await params;
  const { grade, groupId } = await searchParams;

  const auth = await getActiveAuth();
  if (!auth || !isEducator(auth.role)) redirect(`/${locale}/login/staff`);

  // Designation gate (fresh lookup) — coordinator, or a super admin.
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { ddkCoordinator: true },
  });
  if (!staff?.ddkCoordinator && !auth.roles.includes("SUPER_ADMIN")) {
    redirect(`/${locale}/teacher/dashboard`);
  }

  const ranges = await getSchoolYear();
  const schoolYear = schoolYearLabel(ranges.yearStart.getUTCFullYear());

  const gradeNum = grade ? parseInt(grade) : undefined;
  const allGroups = await db.group.findMany({
    where: { students: { some: {} } },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
  });
  const filteredGroups = gradeNum ? allGroups.filter((g) => g.grade === gradeNum) : allGroups;

  const students = groupId
    ? await db.studentProfile.findMany({
        where: { groupId, user: { isActive: true } },
        include: {
          user: { select: { name: true } },
          ddkAwards: { where: { schoolYear }, select: { points: true } },
        },
        orderBy: { user: { name: "asc" } },
      })
    : [];

  // Add each student's automatic Πλήρης Φοίτηση point (from absences).
  const autoAwards = await fullAttendanceAwards(students.map((s) => s.id), ranges);
  const rows = students
    .map((s) => ({
      id: s.id,
      name: s.user?.name ?? "—",
      total: ddkTotal(s.ddkAwards) + (autoAwards.get(s.id)?.points ?? 0),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "el"));

  const selectedGroup = groupId ? allGroups.find((g) => g.id === groupId) : undefined;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-6 h-6 text-amber-600" />
            ΔΔΚ
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Δημιουργικότητα · Δράση · Κοινωνική Προσφορά — Σχολική χρονιά {schoolYear}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/${locale}/teacher/ddk/points`}
            target="_blank"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
          >
            <BarChart3 className="w-4 h-4" />
            Κατάταξη μαθητών
          </Link>
          <Link
            href={`/${locale}/teacher/ddk/report?all=1&doc=cert`}
            target="_blank"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600"
          >
            <Printer className="w-4 h-4" />
            Πιστοποιητικά σχολείου
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Τάξη</p>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3].map((g) => (
                <Link
                  key={g}
                  href={`?grade=${g}`}
                  className={cn(
                    "h-9 px-5 rounded-lg text-sm font-medium transition-colors border",
                    grade === String(g)
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-slate-600 border-slate-200 hover:border-amber-400 hover:text-amber-700"
                  )}
                >
                  {g}η
                </Link>
              ))}
            </div>
          </div>

          {gradeNum && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Τμήμα</p>
              <div className="flex gap-2 flex-wrap">
                {filteredGroups.map((g) => (
                  <Link
                    key={g.id}
                    href={`?grade=${gradeNum}&groupId=${g.id}`}
                    className={cn(
                      "h-9 px-5 rounded-lg text-sm font-medium transition-colors border",
                      groupId === g.id
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-white text-slate-600 border-slate-200 hover:border-amber-400 hover:text-amber-700"
                    )}
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {!gradeNum && <p className="text-sm text-slate-400">Επιλέξτε τάξη για να ξεκινήσετε.</p>}
        </CardContent>
      </Card>

      {/* Roster */}
      {groupId && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {selectedGroup?.name} — {rows.length} μαθητές
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Link
                href={`/${locale}/teacher/ddk/points?groupId=${groupId}`}
                target="_blank"
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                <BarChart3 className="w-4 h-4" />
                Κατάταξη
              </Link>
              <Link
                href={`/${locale}/teacher/ddk/class?groupId=${groupId}`}
                target="_blank"
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                <Printer className="w-4 h-4" />
                Δραστηριότητες τμήματος
              </Link>
              <Link
                href={`/${locale}/teacher/ddk/report?groupId=${groupId}`}
                target="_blank"
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
              >
                <Printer className="w-4 h-4" />
                Πιστοποιητικά όλων
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-400">Κανένας μαθητής στο τμήμα.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-50">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-amber-50 text-amber-700 text-sm font-bold">
                          {r.total}
                        </span>
                      </td>
                      <td className="px-2 py-3 font-medium text-slate-900">
                        <Link href={`/${locale}/teacher/students/${r.id}`} className="hover:underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-2 py-3">
                        {r.total > 0 && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            {ddkRating(r.total)}
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/${locale}/teacher/ddk/report?studentId=${r.id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-700 text-xs"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Εκτύπωση
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
