import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, AlertTriangle, Users, CalendarX2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getPeriodsPerDay } from "@/lib/schoolConfig";
import { periodLabel } from "@/lib/periods";
import { computeIntegrityReport } from "@/lib/integrityChecks";
import { FixStudentGroupsDialog, type GroupOption } from "./FixStudentGroupsDialog";
import { CleanupRedundantButton } from "./CleanupRedundantButton";

export default async function ChecksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login`);

  const t = await getTranslations("checks");

  const [students, slots, groups, periodsPerDay] = await Promise.all([
    db.studentProfile.findMany({
      where: { user: { isActive: true } },
      select: {
        id: true,
        groupId: true,
        user: { select: { name: true } },
        subjectGroups: { select: { groupId: true } },
      },
    }),
    db.timetableSlot.findMany({
      select: { groupId: true, dayOfWeek: true, period: true },
    }),
    db.group.findMany({
      select: {
        id: true,
        name: true,
        homeroomTeacherId: true,
        homeroomHeadteacherId: true,
        counselorId: true,
        _count: { select: { students: true, studentGroups: true, timetableSlots: true } },
      },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
    }),
    getPeriodsPerDay(),
  ]);

  const report = computeIntegrityReport({
    students: students.map((s) => ({
      id: s.id,
      name: s.user?.name ?? null,
      groupId: s.groupId,
      subjectGroupIds: s.subjectGroups.map((sg) => sg.groupId),
    })),
    slots,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      homeroomCount: g._count.students,
      enrolledCount: g._count.studentGroups,
      slotCount: g._count.timetableSlots,
    })),
    periodsPerDay,
  });

  // Options for the fix dialog — homegroups flagged so the homegroup select
  // only offers real homegroups, while subject enrolment can use any group.
  const groupOptions: GroupOption[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    isHomegroup:
      g._count.students > 0 || !!g.homeroomTeacherId || !!g.homeroomHeadteacherId || !!g.counselorId,
  }));

  const dayLabel = (dow: number) => t(`day${dow}` as "day1");
  const cellChip = (c: { dayOfWeek: number; period: number }) =>
    `${dayLabel(c.dayOfWeek)} ${periodLabel(c.period, locale)}`;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
      </div>

      {report.totalIssues === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
          <ShieldCheck className="w-6 h-6 shrink-0" />
          <p className="font-medium">{t("noIssues")}</p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <p className="font-medium">{t("issueCount", { count: report.totalIssues })}</p>
        </div>
      )}

      {/* Redundant memberships — students enrolled in their own homegroup */}
      {report.redundantMemberships > 0 && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              {t("redundantTitle")}
            </CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              {t("redundantHint", { count: report.redundantMemberships })}
            </p>
          </CardHeader>
          <CardContent>
            <CleanupRedundantButton />
          </CardContent>
        </Card>
      )}

      {/* Groups without students */}
      {report.emptyGroups.length > 0 && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              {t("emptyGroups")} ({report.emptyGroups.length})
            </CardTitle>
            <p className="text-xs text-slate-400 mt-1">{t("emptyGroupsHint")}</p>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-50">
                {report.emptyGroups.map((g) => (
                  <tr key={g.groupId} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <Link
                        href={`/${locale}/admin/groups/${g.groupId}`}
                        className="font-semibold text-slate-800 hover:text-emerald-700"
                      >
                        {g.groupName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {g.hasTimetable && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                          {t("hasLeftoverTimetable")}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Students with coverage problems */}
      {report.coverage.length > 0 && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarX2 className="w-4 h-4" />
              {t("coverageIssues")} ({report.coverage.length})
            </CardTitle>
            <p className="text-xs text-slate-400 mt-1">{t("coverageHint")}</p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("student")}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("memberOf")}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("gaps")}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("overlaps")}</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {report.coverage.map((c) => (
                  <tr key={c.studentId} className="hover:bg-slate-50/60 align-top">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <Link
                        href={`/${locale}/admin/students/${c.studentId}`}
                        className="font-semibold text-slate-800 hover:text-emerald-700"
                      >
                        {c.studentName ?? "—"}
                      </Link>
                      {c.noHomegroup && (
                        <p className="mt-1">
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                            {t("noHomegroup")}
                          </Badge>
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.homegroup && (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                            {c.homegroup.name}
                          </Badge>
                        )}
                        {c.subjectGroups.map((g) => (
                          <Badge key={g.id} variant="outline" className="text-xs text-slate-600">
                            {g.name}
                          </Badge>
                        ))}
                        {!c.homegroup && c.subjectGroups.length === 0 && (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.gaps.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs text-red-600 font-medium">
                            {t("gapsSummary", { count: c.gaps.length })}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {c.gaps.slice(0, 10).map((cell) => (
                              <span
                                key={`${cell.dayOfWeek}-${cell.period}`}
                                className="rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700"
                              >
                                {cellChip(cell)}
                              </span>
                            ))}
                            {c.gaps.length > 10 && (
                              <span className="text-[11px] text-slate-400 self-center">
                                +{c.gaps.length - 10}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.overlaps.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs text-amber-600 font-medium">
                            {t("overlapsSummary", { count: c.overlaps.length })}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {c.overlaps.slice(0, 8).map((cell) => {
                              const names = cell.groupIds
                                .map((id) => groupOptions.find((g) => g.id === id)?.name ?? id)
                                .join(" + ");
                              return (
                                <span
                                  key={`${cell.dayOfWeek}-${cell.period}`}
                                  title={t("overlapBetween", { groups: names })}
                                  className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700"
                                >
                                  {cellChip(cell)} · {names}
                                </span>
                              );
                            })}
                            {c.overlaps.length > 8 && (
                              <span className="text-[11px] text-slate-400 self-center">
                                +{c.overlaps.length - 8}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <FixStudentGroupsDialog
                        studentId={c.studentId}
                        studentName={c.studentName}
                        homegroupId={c.homegroup?.id ?? null}
                        subjectGroups={c.subjectGroups}
                        allGroups={groupOptions}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
