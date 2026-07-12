import { db } from "@/server/db";
import { staffDisplayName } from "@/lib/staffName";
import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Users, ChevronRight } from "lucide-react";
import { InlineTeacherAssign } from "./InlineTeacherAssign";
import { GroupAssignmentImport } from "./GroupAssignmentImport";
import { FilterSelect } from "./FilterSelect";
import { getTranslations } from "next-intl/server";
import {
  parseMissingFilter,
  homegroupWhere,
  isHomegroupWhere,
} from "@/lib/homegroupFilter";

export default async function HomegroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    teacher?: string;
    headteacher?: string;
    counselor?: string;
    missing?: string;
  }>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login/staff`);

  const t = await getTranslations("groups");
  const tCommon = await getTranslations("common");

  const { teacher, headteacher, counselor, missing: missingRaw } = await searchParams;
  const missing = parseMissingFilter(missingRaw);
  const hasFilters = !!(teacher || headteacher || counselor || missing);

  const where = {
    AND: [isHomegroupWhere(), homegroupWhere({ teacher, headteacher, counselor, missing })],
  };

  const [groups, teachers, headteachers, counselors] = await Promise.all([
    db.group.findMany({
      where,
      include: {
        homeroomTeacher:   { include: { user: { select: { name: true } } } },
        homeroomHeadteacher: { include: { user: { select: { name: true } } } },
        counselor:         { include: { user: { select: { name: true } } } },
        _count: { select: { students: true, studentGroups: true } },
      },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
    }),
    db.staffProfile.findMany({
      where: { user: { role: "TEACHER" } },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.staffProfile.findMany({
      where: { user: { role: "HEADTEACHER_B" } },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.staffProfile.findMany({
      where: { user: { role: "STUDENT_COUNSELOR" } },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  // Schedule coding (e.g. "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ") is the canonical staff label.
  const staffLabel = (s: { id: string; scheduleName: string | null; user: { name: string | null } | null }) =>
    staffDisplayName(s, s.id);
  const sortByLabel = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, "el");

  const teacherOptions    = teachers.map((t) => ({ id: t.id, name: staffLabel(t) })).sort(sortByLabel);
  const headteacherOptions = headteachers.map((t) => ({ id: t.id, name: staffLabel(t) })).sort(sortByLabel);
  const counselorOptions  = counselors.map((t) => ({ id: t.id, name: staffLabel(t) })).sort(sortByLabel);

  const byGrade = groups.reduce<Record<number, typeof groups>>((acc, g) => {
    (acc[g.grade] ??= []).push(g);
    return acc;
  }, {});

  const gradeLabel: Record<number, string> = {
    1: t("year1"),
    2: t("year2"),
    3: t("year3"),
  };

  const assignedTeacher    = groups.filter((g) => g.homeroomTeacherId).length;
  const assignedHead       = groups.filter((g) => g.homeroomHeadteacherId).length;
  const assignedCounselor  = groups.filter((g) => g.counselorId).length;
  const unassignedTeacher  = groups.length - assignedTeacher;
  const unassignedHead     = groups.length - assignedHead;
  const unassignedCounselor = groups.length - assignedCounselor;

  const assignedLabel = tCommon("allAssigned");
  const unassignedLabel = (n: number) => `${n} ${tCommon("unassigned")}`;

  const selectClass =
    "h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white max-w-56";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
          <p className="text-slate-500 text-sm mt-1">
            {t("teachers")}:{" "}
            {unassignedTeacher > 0
              ? <span className="text-amber-600 font-medium">{unassignedLabel(unassignedTeacher)}</span>
              : <span className="text-emerald-600 font-medium">{assignedLabel}</span>}
            {" · "}
            {t("headteachersB")}:{" "}
            {unassignedHead > 0
              ? <span className="text-amber-600 font-medium">{unassignedLabel(unassignedHead)}</span>
              : <span className="text-emerald-600 font-medium">{assignedLabel}</span>}
            {" · "}
            {t("counselors")}:{" "}
            {unassignedCounselor > 0
              ? <span className="text-amber-600 font-medium">{unassignedLabel(unassignedCounselor)}</span>
              : <span className="text-emerald-600 font-medium">{assignedLabel}</span>}
          </p>
        </div>
        <GroupAssignmentImport />
      </div>

      {/* Staff lookup filters — apply immediately on change */}
      <form method="GET" className="flex gap-2 flex-wrap items-center">
        <FilterSelect name="teacher" defaultValue={teacher ?? ""} className={selectClass}>
          <option value="">{t("allTeachers")}</option>
          {teacherOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </FilterSelect>
        <FilterSelect name="headteacher" defaultValue={headteacher ?? ""} className={selectClass}>
          <option value="">{t("allHeadteachers")}</option>
          {headteacherOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </FilterSelect>
        <FilterSelect name="counselor" defaultValue={counselor ?? ""} className={selectClass}>
          <option value="">{t("allCounselors")}</option>
          {counselorOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </FilterSelect>
        <FilterSelect name="missing" defaultValue={missing ?? ""} className={selectClass}>
          <option value="">{t("missingNone")}</option>
          <option value="any">{t("missingAny")}</option>
          <option value="teacher">{t("missingTeacher")}</option>
          <option value="headteacher">{t("missingHeadteacher")}</option>
          <option value="counselor">{t("missingCounselor")}</option>
        </FilterSelect>
        {hasFilters && (
          <Link
            href={`/${locale}/admin/homegroups`}
            className="h-9 px-3 flex items-center text-sm text-slate-500 hover:text-slate-800"
          >
            {tCommon("clear")}
          </Link>
        )}
      </form>

      {Object.entries(byGrade).map(([grade, gradeGroups]) => (
        <Card key={grade}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              {gradeLabel[Number(grade)]}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide w-24">Group</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide w-16">
                    <Users className="w-3.5 h-3.5 inline mr-1" />Students
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("homeroomStaff")}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide w-36">{t("counselorColumn")}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {gradeGroups.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-semibold text-slate-800">{g.name}</td>
                    <td className="px-4 py-3 text-slate-500">{g._count.students}</td>
                    <td className="px-4 py-3">
                      <InlineTeacherAssign
                        groupId={g.id}
                        currentTeacherId={g.homeroomTeacherId}
                        currentHeadteacherId={g.homeroomHeadteacherId}
                        currentCounselorId={g.counselorId}
                        teachers={teacherOptions}
                        headteachers={headteacherOptions}
                        counselors={counselorOptions}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {g.counselor ? (
                        <span className="text-sm text-slate-700 font-medium">
                          {staffLabel(g.counselor)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/${locale}/admin/groups/${g.id}`}
                        className="text-slate-300 hover:text-slate-600 transition-colors"
                        title="View group"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}

      {groups.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{hasFilters ? t("noFilterResults") : t("noGroups")}</p>
          {!hasFilters && <p className="text-sm mt-1">{t("importToCreate")}</p>}
        </div>
      )}
    </div>
  );
}
