import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, CalendarRange, FlaskConical, User, Phone, FileWarning, Award, DoorOpen, CalendarX, ListFilter } from "lucide-react";
import { breakMinutes } from "@/lib/toilet";
import { getNow, utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getPeriodsPerDay, periodsForDow, maxPeriodCount, getSchoolYear } from "@/lib/schoolConfig";
import { ddkTotal, ddkRating, schoolYearLabel, summarizeBySection, ddkCategoryLabel } from "@/lib/ddk";
import { fullAttendanceAwardForStudent } from "@/server/ddk";
import { actionLabel } from "@/lib/referralLabels";
import { canViewAccessCode } from "@/lib/rbac";
import { canViewSpecialEdFull } from "@/lib/specialEd";
import { getSpecialEdRecord, getStudentSupport, teachesStudent } from "@/server/specialEd";
import { AccessCodeCard } from "@/components/access/AccessCodeCard";
import { SpecialEdCard } from "@/components/special-ed/SpecialEdCard";
import type { Role } from "@/generated/prisma";

const DOW_LABELS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DOW_SHORT  = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

const GENDER_LABEL: Record<string, string> = { MALE: "Άρρεν", FEMALE: "Θήλυ" };
const ABSENCE_BADGE: Record<string, { label: string; cls: string }> = {
  ABSENT: { label: "Απουσία", cls: "text-red-700 bg-red-50 border-red-200" },
  LATE: { label: "Καθυστέρηση", cls: "text-amber-700 bg-amber-50 border-amber-200" },
  EXCUSED: { label: "Δικαιολογημένη", cls: "text-slate-600 bg-slate-100 border-slate-200" },
};
const CONTACT_ROLE_LABEL: Record<string, string> = {
  FATHER: "Πατέρας",
  MOTHER: "Μητέρα",
  GUARDIAN: "Κηδεμόνας",
  OTHER: "Άλλο",
};

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 border-b border-slate-50 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800 text-right">{value}</dd>
    </div>
  );
}

export default async function StudentSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; studentId: string }>;
  searchParams: Promise<{ view?: string; from?: string; groupId?: string }>;
}) {
  const { locale, studentId } = await params;
  const { view, from, groupId } = await searchParams;
  const showWeek = view === "week";

  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { name: true } },
      group: true,
      subjectGroups: { include: { group: true } },
    },
  });

  if (!student || !student.user) notFound();

  const groupIds = [
    student.groupId,
    ...student.subjectGroups.map((sg) => sg.groupId),
  ].filter(Boolean) as string[];

  const todayStr = localDateStr();
  const today = utcMidnight(todayStr);
  const now = getNow();
  const todayDow = now.getDay();
  const isSchoolDay = todayDow >= 1 && todayDow <= 5;

  const periodsConfig = await getPeriodsPerDay();
  const todayPeriods = periodsForDow(periodsConfig, isSchoolDay ? todayDow : 1);
  const allPeriods = Array.from({ length: maxPeriodCount(periodsConfig) }, (_, i) => i + 1);

  const [allSlots, todayActivities, upcomingTests, viewerStaff] = await Promise.all([
    groupIds.length > 0
      ? db.timetableSlot.findMany({
          where: { groupId: { in: groupIds } },
          include: {
            course: true,
            group: true,
            staff: { include: { user: { select: { name: true } } } },
          },
          orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
        })
      : Promise.resolve([]),
    db.activity.findMany({
      where: { date: today, participants: { some: { studentId } } },
      include: { filer: { include: { user: { select: { name: true } } } } },
      orderBy: { startPeriod: "asc" },
    }),
    groupIds.length > 0
      ? db.testSchedule.findMany({
          where: { groupId: { in: groupIds }, date: { gte: today } },
          include: {
            course: { select: { name: true } },
            group: { select: { name: true } },
            staff: { include: { user: { select: { name: true } } } },
          },
          orderBy: [{ date: "asc" }, { period: "asc" }],
          take: 20,
        })
      : Promise.resolve([]),
    db.staffProfile.findUnique({ where: { userId: session.user.id }, select: { id: true, ddkCoordinator: true, specialEducation: true } }),
  ]);

  // Full dossier (personal info + contacts + referrals) is shown only to the
  // student's homeroom teacher, their group's headteacher, and top management/counselor.
  const role = session.user.role as Role;
  const TOP_ROLES = ["HEADMASTER", "HEADTEACHER_A", "STUDENT_COUNSELOR", "SUPER_ADMIN"];
  const canViewFull =
    TOP_ROLES.includes(role) ||
    (!!viewerStaff &&
      (student.group?.homeroomTeacherId === viewerStaff.id ||
        student.group?.homeroomHeadteacherId === viewerStaff.id));

  // School-year boundary, reused for absences below and the ΔΔΚ card later.
  const yearRanges = await getSchoolYear();

  const [contacts, referralRecords, toiletBreaks, absenceRecords] = canViewFull
    ? await Promise.all([
        // ALL phone numbers (active and inactive) — inactive ones are badged.
        db.smsContact.findMany({
          where: { studentId },
          select: { id: true, name: true, phone: true, role: true, active: true, isDefault: true },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        }),
        db.referralStudent.findMany({
          where: { studentId, referral: { isDraft: false } },
          include: {
            referral: { select: { id: true, number: true, date: true, description: true, location: true } },
            resolution: { include: { expulsionDays: { orderBy: { date: "asc" as const } } } },
          },
          orderBy: { referral: { date: "desc" } },
        }),
        db.toiletBreak.findMany({
          where: { studentId },
          select: {
            id: true,
            date: true,
            period: true,
            leftAt: true,
            returnedAt: true,
            staff: { select: { scheduleName: true } },
          },
          orderBy: { leftAt: "desc" },
          take: 50,
        }),
        db.attendance.findMany({
          where: {
            studentId,
            waived: false,
            status: { in: ["ABSENT", "LATE", "EXCUSED"] },
            date: { gte: yearRanges.yearStart },
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
          take: 200,
        }),
      ])
    : [[], [], [], []];

  type SlotEntry = (typeof allSlots)[0] & { isSubjectGroup?: boolean };
  const grid: Record<number, Record<number, SlotEntry>> = {};

  for (const slot of allSlots.filter((s) => s.groupId === student.groupId)) {
    grid[slot.dayOfWeek] ??= {};
    grid[slot.dayOfWeek]![slot.period] = slot;
  }
  for (const slot of allSlots.filter((s) => s.groupId !== student.groupId)) {
    grid[slot.dayOfWeek] ??= {};
    grid[slot.dayOfWeek]![slot.period] = { ...slot, isSubjectGroup: true };
  }

  const activityByPeriod: Record<number, string> = {};
  for (const act of todayActivities) {
    for (let p = act.startPeriod; p <= act.endPeriod; p++) {
      activityByPeriod[p] = act.name;
    }
  }

  const canManageCode = canViewAccessCode(role, viewerStaff?.id, student.group);
  // ΔΔΚ is shown only to those who need it: the student's homegroup staff /
  // management / counselor (canViewFull) and the ΔΔΚ coordinator.
  const canViewDdk = canViewFull || !!viewerStaff?.ddkCoordinator;

  // Special education (sensitive). Full record → counselor / special-ed deputy /
  // headmaster / super-admin; codes-only intentional reveal → any teacher who
  // teaches the student; nothing for everyone else. Only render if a record exists.
  const specialEdFullAccess = canViewSpecialEdFull([role], !!viewerStaff?.specialEducation);
  const specialEdExists = await db.specialEdRecord.findUnique({ where: { studentId }, select: { id: true } });
  let specialEdMode: "full" | "codes" | null = null;
  let specialEdData:
    | (NonNullable<Awaited<ReturnType<typeof getSpecialEdRecord>>> & { support: Awaited<ReturnType<typeof getStudentSupport>> })
    | undefined;
  if (specialEdExists) {
    if (specialEdFullAccess) {
      const [rec, support] = await Promise.all([getSpecialEdRecord(studentId), getStudentSupport(studentId)]);
      if (rec) {
        specialEdMode = "full";
        specialEdData = { ...rec, support };
      }
    } else if (viewerStaff && (await teachesStudent(viewerStaff.id, studentId))) {
      specialEdMode = "codes";
    }
  }

  // ΔΔΚ contribution points for the current school year.
  const ddkRanges = yearRanges;
  const ddkSchoolYear = schoolYearLabel(ddkRanges.yearStart.getUTCFullYear());
  const ddkStored = await db.ddkAward.findMany({
    where: { studentId, schoolYear: ddkSchoolYear },
    orderBy: { createdAt: "asc" },
  });
  // The Πλήρης Φοίτηση point is computed from absences, not stored.
  const ddkAuto = await fullAttendanceAwardForStudent(studentId, ddkRanges);
  const ddkItems = [
    ...ddkStored.map((a) => ({ categoryCode: a.categoryCode, points: a.points, note: a.note })),
    ...(ddkAuto ? [ddkAuto] : []),
  ];
  const ddkPoints = ddkTotal(ddkItems);
  const ddkSections = summarizeBySection(ddkItems);

  const backUrl = from === "homegroup"
    ? `/${locale}/teacher/homegroup${groupId ? `?groupId=${groupId}` : ""}`
    : student.group
      ? `/${locale}/teacher/attendance/locate?grade=${student.group.grade}&groupId=${student.groupId}`
      : `/${locale}/teacher/attendance/locate`;

  const dayUrl = `/${locale}/teacher/students/${studentId}`;
  const weekUrl = `/${locale}/teacher/students/${studentId}?view=week`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href={backUrl} className="text-slate-500 hover:text-slate-700 mt-1 flex-shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-slate-900">{student.user?.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            {student.group && <Badge variant="outline">{student.group.name}</Badge>}
            {student.subjectGroups.length > 0 && (
              <span className="text-xs text-slate-400">
                +{student.subjectGroups.length} support group{student.subjectGroups.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Day / Week toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden flex-shrink-0">
          <Link
            href={dayUrl}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              !showWeek
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-500 hover:bg-slate-50"
            )}
          >
            Today
          </Link>
          <Link
            href={weekUrl}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200",
              showWeek
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-500 hover:bg-slate-50"
            )}
          >
            Week
          </Link>
        </div>
        {canViewFull && (
          <Link
            href={`/${locale}/teacher/students/${studentId}/records`}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 flex-shrink-0"
          >
            <ListFilter className="w-4 h-4" />
            Όλα τα δεδομένα
          </Link>
        )}
      </div>

      {canManageCode && <AccessCodeCard studentProfileId={studentId} />}

      {specialEdMode && (
        <SpecialEdCard studentId={studentId} mode={specialEdMode} data={specialEdData} locale={locale} />
      )}

      {/* Full dossier — personal info, contacts, referrals (authorised viewers only) */}
      {canViewFull && (
        <div className="space-y-5">
          {/* Personal information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4" /> Προσωπικά Στοιχεία
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                <Field label="Αρ. Μητρώου" value={student.studentId} />
                <Field label="Τμήμα" value={student.group?.name} />
                <Field label="Φύλο" value={student.gender ? GENDER_LABEL[student.gender] : null} />
                <Field
                  label="Ημ. Γέννησης"
                  value={student.dateOfBirth ? fmtDisplayDate(student.dateOfBirth) : null}
                />
                <Field label="Τόπος Γέννησης" value={student.placeOfBirth} />
                <Field label="Υπηκοότητα" value={student.nationality} />
                {/* Identity documents (ταυτότητα/διαβατήριο/ARC) — super admin only. */}
                {role === "SUPER_ADMIN" && (
                  <>
                    <Field label="Αρ. Ταυτότητας" value={student.idCardNumber} />
                    <Field label="Αρ. Διαβατηρίου" value={student.passportNumber} />
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Contact phone numbers */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="w-4 h-4" /> Τηλέφωνα Επικοινωνίας
                </CardTitle>
              </CardHeader>
              <CardContent>
                {contacts.length === 0 ? (
                  <p className="text-sm text-slate-400">Δεν υπάρχουν καταχωρημένα τηλέφωνα.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {contacts.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{c.name}</span>
                            {c.active && (
                              <span className="flex-shrink-0 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-px rounded">Τηλέφωνο sms</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400">{CONTACT_ROLE_LABEL[c.role] ?? c.role}</p>
                        </div>
                        <a
                          href={`tel:${c.phone}`}
                          className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 whitespace-nowrap"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {c.phone}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Referrals */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileWarning className="w-4 h-4" /> Καταγγελίες ({referralRecords.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {referralRecords.length === 0 ? (
                  <p className="text-sm text-slate-400">Καμία καταγγελία.</p>
                ) : (
                  <ul className="space-y-2">
                    {referralRecords.map((rs) => (
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
          </div>

          {/* Absences + toilet breaks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Absences for the school year */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarX className="w-4 h-4" /> Απουσίες ({absenceRecords.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {absenceRecords.length === 0 ? (
                  <p className="text-sm text-slate-400">Καμία απουσία.</p>
                ) : (
                  <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                    {absenceRecords.map((a) => {
                      const badge = ABSENCE_BADGE[a.status] ?? ABSENCE_BADGE.ABSENT!;
                      const period = a.timetableSlot?.period ?? a.intercalaryPeriod;
                      const course = a.timetableSlot
                        ? a.timetableSlot.course.nameEl || a.timetableSlot.course.name
                        : null;
                      return (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-1.5"
                        >
                          <div className="min-w-0 text-sm">
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

            {/* Toilet breaks */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <DoorOpen className="w-4 h-4" /> Έξοδοι Τουαλέτας ({toiletBreaks.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {toiletBreaks.length === 0 ? (
                  <p className="text-sm text-slate-400">Καμία καταγεγραμμένη έξοδος.</p>
                ) : (
                  <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                    {toiletBreaks.map((b) => {
                      const mins = breakMinutes(b.leftAt, b.returnedAt, now);
                      const open = !b.returnedAt;
                      return (
                        <li
                          key={b.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-1.5 text-sm"
                        >
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
          </div>
        </div>
      )}

      {/* ΔΔΚ — contribution points for the school year */}
      {canViewDdk && ddkItems.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600" />
                ΔΔΚ {ddkSchoolYear}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-2xl font-bold text-amber-700 leading-none">{ddkPoints}</span>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  {ddkRating(ddkPoints)}
                </Badge>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ddkSections.map((s) => (
              <div key={s.section.key}>
                <p className="text-xs font-semibold text-slate-500 mb-1">
                  {s.section.label} · {s.points}
                </p>
                <ul className="space-y-1">
                  {s.awards.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-amber-100 text-amber-700 text-xs font-bold flex-shrink-0">
                        {a.points}
                      </span>
                      <span className="text-slate-700 truncate">
                        {ddkCategoryLabel(a.categoryCode)}
                        {a.note && <span className="text-slate-400"> · {a.note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Today's activities */}
      {todayActivities.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
              <CalendarRange className="w-4 h-4" />
              Today&apos;s Activities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {todayActivities.map((a) => (
              <div key={a.id} className="flex items-center gap-3 text-sm">
                <span className="text-emerald-700 font-medium">{a.name}</span>
                <span className="text-emerald-600">
                  P{a.startPeriod}{a.startPeriod !== a.endPeriod && `–${a.endPeriod}`}
                </span>
                {a.location && <span className="text-emerald-500">· {a.location}</span>}
                <Link href={`/${locale}/teacher/activities/${a.id}`} className="text-emerald-600 hover:underline text-xs ml-auto">
                  View
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* DAY VIEW */}
      {!showWeek && (
        <>
          {isSchoolDay ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Today — {DOW_LABELS[todayDow]}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-50">
                    {todayPeriods.map((p) => {
                      const slot = grid[todayDow]?.[p];
                      const activity = activityByPeriod[p];
                      return (
                        <tr key={p} className={activity ? "bg-emerald-50/60" : "hover:bg-slate-50"}>
                          <td className="px-5 py-3 text-xs font-semibold text-slate-400 w-14">P{p}</td>
                          {activity ? (
                            <td colSpan={3} className="px-5 py-3">
                              <span className="font-medium text-emerald-700">{activity}</span>
                              <Badge variant="outline" className="ml-2 text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Activity</Badge>
                            </td>
                          ) : slot ? (
                            <>
                              <td className="px-5 py-3 font-medium text-slate-900">{slot.course.name}</td>
                              <td className="px-5 py-3 text-slate-500">{slot.staff?.scheduleName ?? slot.staffName ?? slot.staff?.user?.name ?? "—"}</td>
                              <td className="px-5 py-3 text-slate-400">{slot.room ?? ""}</td>
                            </>
                          ) : (
                            <td colSpan={3} className="px-5 py-3 text-slate-300">—</td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-slate-400">No school today — switch to Week view to see the timetable.</p>
          )}
        </>
      )}

      {/* UPCOMING TESTS */}
      {upcomingTests.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4" />
              Upcoming Tests
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Subject</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Group</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Period</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {upcomingTests.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {DOW_SHORT[t.date.getUTCDay()]} {fmtDisplayDate(t.date)}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{t.course.name}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{t.group.name}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {t.periodCount > 1 ? `P${t.period}–${t.period + t.periodCount - 1}` : `P${t.period}`}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant="outline"
                        className={t.type === "BIG"
                          ? "text-xs bg-slate-800 text-white border-slate-800"
                          : "text-xs bg-slate-100 text-slate-600 border-slate-200"}
                      >
                        {t.type === "BIG" ? "Big · 45 min" : "Small · 20 min"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* WEEK VIEW */}
      {showWeek && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Weekly Timetable</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 w-10" />
                  {[1, 2, 3, 4, 5].map((d) => (
                    <th
                      key={d}
                      className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide ${
                        d === todayDow ? "text-emerald-600" : "text-slate-500"
                      }`}
                    >
                      {DOW_SHORT[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allPeriods.map((p) => (
                  <tr key={p} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-semibold text-slate-400">P{p}</td>
                    {[1, 2, 3, 4, 5].map((d) => {
                      const slot = grid[d]?.[p];
                      const isToday = d === todayDow;
                      const activity = isToday ? activityByPeriod[p] : undefined;
                      return (
                        <td key={d} className={`px-4 py-3 ${isToday ? "bg-emerald-50/30" : ""}`}>
                          {activity ? (
                            <div>
                              <p className="font-medium text-emerald-700 leading-tight text-xs">{activity}</p>
                              <Badge variant="outline" className="text-[10px] px-1 py-0 mt-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">Activity</Badge>
                            </div>
                          ) : slot ? (
                            <div className="space-y-0.5">
                              <p className="font-medium text-slate-800 leading-tight text-xs">{slot.course.name}</p>
                              {(slot.staff?.scheduleName ?? slot.staffName ?? slot.staff?.user?.name) && (
                                <p className="text-[11px] text-slate-500 leading-tight">{slot.staff?.scheduleName ?? slot.staffName ?? slot.staff?.user?.name}</p>
                              )}
                              {slot.room && (
                                <p className="text-[11px] text-slate-400 leading-tight">Room {slot.room}</p>
                              )}
                              {slot.isSubjectGroup && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0">{slot.group.name}</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
                      );
                    })}
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
