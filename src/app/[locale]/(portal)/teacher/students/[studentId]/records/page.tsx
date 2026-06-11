import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, FileWarning, CalendarX, DoorOpen, FlaskConical } from "lucide-react";
import { fmtDisplayDate, utcMidnight, localDateStr, normalizeIsoDate, getNow } from "@/lib/dates";
import { getSchoolYear } from "@/lib/schoolConfig";
import { breakMinutes } from "@/lib/toilet";
import { actionLabel } from "@/lib/referralLabels";
import { GRADE_PASS } from "@/lib/grades";
import { RecordsFilter } from "./RecordsFilter";
import type { Role } from "@/generated/prisma";

const ABSENCE_BADGE: Record<string, { label: string; cls: string }> = {
  ABSENT: { label: "Απουσία", cls: "text-red-700 bg-red-50 border-red-200" },
  LATE: { label: "Καθυστέρηση", cls: "text-amber-700 bg-amber-50 border-amber-200" },
  EXCUSED: { label: "Δικαιολογημένη", cls: "text-slate-600 bg-slate-100 border-slate-200" },
};
const ABS_STATUSES = ["ABSENT", "LATE", "EXCUSED"] as const;
type AbsStatus = (typeof ABS_STATUSES)[number];

type Cat = "all" | "absences" | "referrals" | "toilet" | "tests";
const CATS: { key: Cat; label: string }[] = [
  { key: "all", label: "Όλα" },
  { key: "absences", label: "Απουσίες" },
  { key: "referrals", label: "Καταγγελίες" },
  { key: "toilet", label: "Τουαλέτα" },
  { key: "tests", label: "Διαγωνίσματα" },
];

export default async function StudentRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; studentId: string }>;
  searchParams: Promise<{ from?: string; to?: string; cat?: string; status?: string }>;
}) {
  const { locale, studentId } = await params;
  const sp = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      user: { select: { name: true } },
      groupId: true,
      group: {
        select: {
          name: true,
          grade: true,
          homeroomTeacherId: true,
          homeroomHeadteacherId: true,
          counselorId: true,
        },
      },
    },
  });
  if (!student || !student.user) notFound();

  // Same access rule as the dossier's full view: homegroup staff, the group's
  // counselor, top management, super admin.
  const role = session.user.role as Role;
  const TOP_ROLES = ["HEADMASTER", "HEADTEACHER_A", "STUDENT_COUNSELOR", "SUPER_ADMIN"];
  const viewerStaff = await db.staffProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  const canView =
    TOP_ROLES.includes(role) ||
    (!!viewerStaff &&
      (student.group?.homeroomTeacherId === viewerStaff.id ||
        student.group?.homeroomHeadteacherId === viewerStaff.id ||
        student.group?.counselorId === viewerStaff.id));
  if (!canView) redirect(`/${locale}/teacher/students/${studentId}`);

  // ── Filters ──────────────────────────────────────────────────────────────
  const ranges = await getSchoolYear();
  const yearStartStr = ranges.yearStart.toISOString().slice(0, 10);
  const todayStr = localDateStr();
  const fromStr = normalizeIsoDate(sp.from) ?? yearStartStr;
  const toStr = normalizeIsoDate(sp.to) ?? todayStr;
  const from = utcMidnight(fromStr);
  const to = utcMidnight(toStr);
  const cat: Cat = (CATS.find((c) => c.key === sp.cat)?.key ?? "all") as Cat;
  const statusFilter: AbsStatus | "all" = ABS_STATUSES.includes(sp.status as AbsStatus)
    ? (sp.status as AbsStatus)
    : "all";

  const dateRange = { gte: from, lte: to };
  const wantAbs = cat === "all" || cat === "absences";
  const wantRef = cat === "all" || cat === "referrals";
  const wantToilet = cat === "all" || cat === "toilet";
  const wantTests = cat === "all" || cat === "tests";

  const [absences, referrals, toilet, tests] = await Promise.all([
    wantAbs
      ? db.attendance.findMany({
          where: {
            studentId,
            waived: false,
            date: dateRange,
            status: statusFilter === "all" ? { in: [...ABS_STATUSES] } : statusFilter,
          },
          select: {
            id: true,
            date: true,
            status: true,
            isAutoAbsent: true,
            exitPermitId: true,
            intercalaryPeriod: true,
            timetableSlot: { select: { period: true, course: { select: { nameEl: true, name: true } } } },
          },
          orderBy: [{ date: "desc" }],
        })
      : Promise.resolve([]),
    wantRef
      ? db.referralStudent.findMany({
          where: { studentId, referral: { isDraft: false, date: dateRange } },
          include: {
            referral: { select: { id: true, number: true, date: true, description: true, location: true } },
            resolution: { include: { expulsionDays: true } },
          },
          orderBy: { referral: { date: "desc" } },
        })
      : Promise.resolve([]),
    wantToilet
      ? db.toiletBreak.findMany({
          where: { studentId, date: dateRange },
          select: {
            id: true,
            date: true,
            period: true,
            leftAt: true,
            returnedAt: true,
            staff: { select: { scheduleName: true } },
          },
          orderBy: { leftAt: "desc" },
        })
      : Promise.resolve([]),
    wantTests
      ? db.testGrade.findMany({
          where: { studentId, testSchedule: { date: dateRange } },
          select: {
            id: true,
            value: true,
            testSchedule: {
              select: { date: true, type: true, course: { select: { nameEl: true, name: true } } },
            },
          },
          orderBy: { testSchedule: { date: "desc" } },
        })
      : Promise.resolve([]),
  ]);

  const now = getNow();

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href={`/${locale}/teacher/students/${studentId}`}
          className="text-slate-500 hover:text-slate-700 mt-1 flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-slate-900">{student.user.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            {student.group && <Badge variant="outline">{student.group.name}</Badge>}
            <span className="text-sm text-slate-400">Όλα τα δεδομένα</span>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <RecordsFilter initial={{ from: fromStr, to: toStr, cat, status: statusFilter }} />

      {/* Absences */}
      {wantAbs && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarX className="w-4 h-4" /> Απουσίες ({absences.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {absences.length === 0 ? (
              <p className="text-sm text-slate-400">Καμία απουσία στο διάστημα.</p>
            ) : (
              <ul className="space-y-1.5">
                {absences.map((a) => {
                  const badge = ABSENCE_BADGE[a.status] ?? ABSENCE_BADGE.ABSENT!;
                  const period = a.timetableSlot?.period ?? a.intercalaryPeriod;
                  const course = a.timetableSlot
                    ? a.timetableSlot.course.nameEl || a.timetableSlot.course.name
                    : null;
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-1.5 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-700">{fmtDisplayDate(a.date)}</span>
                        {period != null && <span className="text-slate-400"> · Π{period}</span>}
                        {course && <span className="text-slate-500"> · {course}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {a.exitPermitId && (
                          <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-50 border border-yellow-200 px-1 py-px rounded">
                            Άδεια εξόδου
                          </span>
                        )}
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded border ${badge.cls}`}>
                          {badge.label}
                          {a.status === "ABSENT" && a.isAutoAbsent && " (αυτ.)"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Referrals */}
      {wantRef && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileWarning className="w-4 h-4" /> Καταγγελίες ({referrals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {referrals.length === 0 ? (
              <p className="text-sm text-slate-400">Καμία καταγγελία στο διάστημα.</p>
            ) : (
              <ul className="space-y-2">
                {referrals.map((rs) => (
                  <li key={rs.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Link
                        href={`/${locale}/teacher/referrals/${rs.referral.id}/print`}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
                      >
                        <span className="text-slate-700 font-semibold">#{rs.referral.number}</span>
                        {fmtDisplayDate(rs.referral.date)}
                        {rs.referral.location && <span className="text-slate-400">· {rs.referral.location}</span>}
                      </Link>
                      {rs.status === "RESOLVED" ? (
                        <span className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
                          {rs.resolution ? actionLabel(rs.resolution.action) : "Επιλύθηκε"}
                          {rs.resolution && rs.resolution.expulsionDays.length > 0 &&
                            ` · ${rs.resolution.expulsionDays.length}η`}
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          Εκκρεμής
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 line-clamp-2">{rs.referral.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Toilet breaks */}
      {wantToilet && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DoorOpen className="w-4 h-4" /> Έξοδοι Τουαλέτας ({toilet.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {toilet.length === 0 ? (
              <p className="text-sm text-slate-400">Καμία έξοδος στο διάστημα.</p>
            ) : (
              <ul className="space-y-1.5">
                {toilet.map((b) => {
                  const mins = breakMinutes(b.leftAt, b.returnedAt, now);
                  const open = !b.returnedAt;
                  return (
                    <li key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-1.5 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-700">{fmtDisplayDate(b.date)}</span>
                        {b.period != null && <span className="text-slate-400"> · Π{b.period}</span>}
                        {b.staff?.scheduleName && <span className="text-slate-400"> · {b.staff.scheduleName}</span>}
                      </div>
                      <span
                        className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${
                          open
                            ? "text-red-700 bg-red-50 border-red-200"
                            : mins > 10
                              ? "text-amber-700 bg-amber-50 border-amber-200"
                              : "text-slate-600 bg-slate-100 border-slate-200"
                        }`}
                      >
                        {open ? "Σε εξέλιξη" : `${mins}′`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tests */}
      {wantTests && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4" /> Διαγωνίσματα ({tests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tests.length === 0 ? (
              <p className="text-sm text-slate-400">Κανένα διαγώνισμα στο διάστημα.</p>
            ) : (
              <ul className="space-y-1.5">
                {tests.map((g) => {
                  const value = g.value != null ? Number(g.value) : null;
                  const course = g.testSchedule.course.nameEl || g.testSchedule.course.name;
                  return (
                    <li key={g.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-1.5 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-700">{fmtDisplayDate(g.testSchedule.date)}</span>
                        <span className="text-slate-500"> · {course}</span>
                      </div>
                      {value == null ? (
                        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded border text-slate-400 bg-slate-50 border-slate-200 flex-shrink-0">
                          Χωρίς βαθμό
                        </span>
                      ) : (
                        <span
                          className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${
                            value < GRADE_PASS
                              ? "text-red-700 bg-red-50 border-red-200"
                              : "text-emerald-700 bg-emerald-50 border-emerald-200"
                          }`}
                        >
                          {value}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
