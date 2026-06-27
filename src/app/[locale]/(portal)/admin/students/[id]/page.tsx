import { db } from "@/server/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronLeft, Pencil, User, Phone, Calendar, MapPin,
  CreditCard, Globe, Users, BookOpen, Clock, Layers,
  CalendarDays, AlertTriangle,
} from "lucide-react";
import { fmtDisplayDate } from "@/lib/dates";
import { SmsRecipientsCard } from "@/components/students/SmsRecipientsCard";
import { AccountsCard, type StudentAccount } from "@/components/students/AccountsCard";
import { pickQueryString } from "@/lib/listFilters";
import { AccessCodeCard } from "@/components/access/AccessCodeCard";
import { getPeriodsPerDay, getMaxGuardiansPerStudent } from "@/lib/schoolConfig";
import { periodsForDow, maxPeriodCount } from "@/lib/periods";
import { isPassing } from "@/lib/grades";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ grade?: string; groupId?: string; search?: string; page?: string }>;
}) {
  const { locale, id } = await params;

  // List filters forwarded by the students table — "Back to students" returns
  // to the same pills/search/page instead of the bare list.
  const backHref = `/${locale}/admin/students${pickQueryString(await searchParams, [
    "grade",
    "groupId",
    "search",
    "page",
  ])}`;

  const student = await db.studentProfile.findUnique({
    where: { id },
    include: {
      user: true,
      group: true,
      subjectGroups: {
        include: { group: true },
        orderBy: { group: { name: "asc" } },
      },
      parents: {
        include: {
          parentProfile: {
            include: { user: true },
          },
        },
      },
      smsContacts: {
        orderBy: [{ isDefault: "desc" }, { active: "desc" }, { role: "asc" }],
      },
      accessCode: { select: { guardianClaims: true } },
      grades: {
        include: { course: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      },
      attendance: {
        include: { timetableSlot: { include: { course: true } } },
        orderBy: { date: "desc" },
        take: 20,
      },
    },
  });

  if (!student) notFound();

  const { user, group, subjectGroups, parents, smsContacts, grades, attendance } = student;

  // All login accounts linked to this student — the student's own + each guardian.
  const maxGuardians = await getMaxGuardiansPerStudent();
  const accounts: StudentAccount[] = [
    {
      userId: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      hasPassword: !!user.passwordHash,
      kind: "student",
    },
    ...parents.map(({ parentProfile }) => ({
      userId: parentProfile.user.id,
      name: parentProfile.user.name,
      email: parentProfile.user.email,
      isActive: parentProfile.user.isActive,
      hasPassword: !!parentProfile.user.passwordHash,
      kind: "guardian" as const,
      role: parentProfile.role,
      parentProfileId: parentProfile.id,
    })),
  ];
  const guardianClaims = student.accessCode?.guardianClaims ?? parents.length;

  // Parents/guardians as recorded by the import (SMS contacts). They become
  // login accounts only when they activate their access code, so show the
  // contacts here rather than an empty "no parents" — the actual login accounts
  // are listed in the Accounts card below.
  const parentContacts = smsContacts.filter(
    (c) => c.role === "FATHER" || c.role === "MOTHER" || c.role === "GUARDIAN",
  );

  // Weekly timetable = union of homegroup + subject-group slots. Cells with
  // more than one slot are scheduling conflicts and are flagged.
  const groupIds = [
    ...(student.groupId ? [student.groupId] : []),
    ...subjectGroups.map((sg) => sg.groupId),
  ];
  const [slots, periodsPerDay] = await Promise.all([
    groupIds.length > 0
      ? db.timetableSlot.findMany({
          where: { groupId: { in: groupIds } },
          include: {
            course: { select: { name: true } },
            group: { select: { name: true } },
          },
          orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
        })
      : Promise.resolve([]),
    getPeriodsPerDay(),
  ]);

  type Slot = (typeof slots)[number];
  const cells = new Map<number, Slot[]>(); // dow*100+period → all slots in that cell
  for (const s of slots) {
    const key = s.dayOfWeek * 100 + s.period;
    cells.set(key, [...(cells.get(key) ?? []), s]);
  }
  const allPeriods = Array.from({ length: maxPeriodCount(periodsPerDay) }, (_, i) => i + 1);
  const dayPeriodCount = (dow: number) => periodsForDow(periodsPerDay, dow).length;
  const conflictCells = [...cells.values()].filter((c) => c.length >= 2).length;
  const gapCells = groupIds.length > 0
    ? [1, 2, 3, 4, 5].reduce(
        (sum, dow) =>
          sum +
          periodsForDow(periodsPerDay, dow).filter((p) => !cells.has(dow * 100 + p)).length,
        0
      )
    : 0;

  const absentCount  = attendance.filter((a) => a.status === "ABSENT").length;
  const lateCount    = attendance.filter((a) => a.status === "LATE").length;
  const presentCount = attendance.filter((a) => a.status === "PRESENT").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to students
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{user.name ?? "—"}</h2>
            <p className="text-slate-500 text-sm mt-0.5 font-mono">{student.studentId}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {group && (
              <Badge variant="outline" className="text-sm">{group.name}</Badge>
            )}
            <Badge
              variant="outline"
              className={user.isActive
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-red-50 text-red-700 border-red-200"}
            >
              {user.isActive ? "Active" : "Inactive"}
            </Badge>
            <Link
              href={`/${locale}/admin/students/${id}/edit`}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-200 text-sm text-slate-600 font-medium hover:bg-slate-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Link>
          </div>
        </div>
      </div>

      <AccessCodeCard studentProfileId={id} canGenerate />

      {/* Weekly timetable with conflict highlighting */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-400" />
              Weekly timetable
            </CardTitle>
            <div className="flex items-center gap-2">
              {conflictCells > 0 && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                  {conflictCells} conflict{conflictCells !== 1 ? "s" : ""}
                </Badge>
              )}
              {gapCells > 0 && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                  {gapCells} free period{gapCells !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {groupIds.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">
              No groups assigned — the student has no timetable.
            </p>
          ) : (
            <>
              {conflictCells > 0 && (
                <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Two of this student&apos;s groups have a lesson at the same time — the
                  conflicting cells are highlighted below. Fix it from{" "}
                  <Link href={`/${locale}/admin/checks`} className="font-semibold underline">
                    Data Checks
                  </Link>.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="w-10 px-3 py-2.5 text-xs font-semibold text-slate-400" />
                      {DAYS.map((d) => (
                        <th key={d} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {allPeriods.map((period) => (
                      <tr key={period}>
                        <td className="px-3 py-2 text-center text-xs font-bold text-slate-400">{period}</td>
                        {[1, 2, 3, 4, 5].map((dow) => {
                          const inDay = period <= dayPeriodCount(dow);
                          const cellSlots = cells.get(dow * 100 + period) ?? [];
                          const conflict = cellSlots.length >= 2;
                          return (
                            <td
                              key={dow}
                              className={cn(
                                "px-3 py-2 align-top",
                                !inDay && "bg-slate-50/60",
                                conflict && "bg-red-50",
                                inDay && cellSlots.length === 0 && "bg-amber-50/40"
                              )}
                            >
                              {!inDay ? null : cellSlots.length === 0 ? (
                                <span className="text-[11px] text-amber-500">free</span>
                              ) : (
                                <div className="space-y-1">
                                  {cellSlots.map((s) => (
                                    <div key={s.id} className={cn(conflict && "rounded-md border border-red-200 bg-white px-1.5 py-1")}>
                                      <p className={cn("text-xs font-medium truncate", conflict ? "text-red-700" : "text-slate-800")}>
                                        {s.course.name}
                                      </p>
                                      <p className={cn("text-[11px] truncate", s.groupId === student.groupId ? "text-slate-400" : "text-indigo-500")}>
                                        {s.group.name}
                                        {s.room ? ` · ${s.room}` : ""}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">

          {/* Personal information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                Personal information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <Field label="Full name"       value={user.name} />
                <Field label="Student ID"      value={student.studentId} mono />
                <Field label="Gender"          value={student.gender === "MALE" ? "Male" : student.gender === "FEMALE" ? "Female" : null} />
                <Field label="Date of birth"   value={student.dateOfBirth ? fmtDisplayDate(student.dateOfBirth) : null} />
                <Field label="Place of birth"  value={student.placeOfBirth} />
                <Field label="Nationality"     value={student.nationality} />
                <Field label="Address"         value={student.address} />
                <Field label="ID card"         value={student.idCardNumber} mono />
                <Field label="Passport"        value={student.passportNumber} mono />
                <Field label="Group"           value={group?.name ?? null} />
                <Field label="Email"           value={user.email} />
              </dl>
            </CardContent>
          </Card>

          {/* Parents / Guardians — contacts from the import */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                Parents / Guardians
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {parentContacts.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-400 text-center">No parents on record</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                        <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                        <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {parentContacts.map((c) => (
                        <tr key={c.id}>
                          <td className="px-5 py-3 font-medium text-slate-900">{c.name}</td>
                          <td className="px-5 py-3">
                            <Badge variant="outline" className="text-xs capitalize">{c.role.toLowerCase()}</Badge>
                          </td>
                          <td className="px-5 py-3 text-slate-600">
                            {c.phone
                              ? <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-emerald-600">
                                  <Phone className="w-3 h-3" />{c.phone}
                                </a>
                              : <span className="text-slate-400">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="px-5 py-3 text-xs text-slate-400 border-t border-slate-50">
                    Recorded from the import. A parent gets a login account only when they activate their access code (see Accounts below).
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Accounts — login accounts linked to this student (own + guardians) */}
          <AccountsCard
            studentProfileId={student.id}
            accounts={accounts}
            guardianClaims={guardianClaims}
            maxGuardians={maxGuardians}
          />

          {/* Subject groups */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-400" />
                Subject groups ({subjectGroups.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {subjectGroups.length === 0 ? (
                <p className="text-sm text-slate-400">No subject groups assigned — import enrollment first.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {subjectGroups.map(({ group: g }) => (
                    <Badge key={g.id} variant="outline" className="font-mono text-xs">
                      {g.name}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent grades */}
          {grades.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-slate-400" />
                  Recent grades
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Course</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</th>
                      <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {grades.map((g) => (
                      <tr key={g.id}>
                        <td className="px-5 py-3 font-medium text-slate-900">{g.course.nameEl}</td>
                        <td className="px-5 py-3 text-slate-500">{g.period}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`font-semibold ${isPassing(Number(g.value)) ? "text-green-700" : "text-red-600"}`}>
                            {Number(g.value).toFixed(1)}
                          </span>
                          <span className="text-slate-400 text-xs"> / 20</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">

          {/* Attendance summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                Attendance (last {attendance.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <AttStat label="Present" value={presentCount} color="text-green-700" bg="bg-green-50" />
              <AttStat label="Late"    value={lateCount}    color="text-amber-700" bg="bg-amber-50" />
              <AttStat label="Absent"  value={absentCount}  color="text-red-700"   bg="bg-red-50" />
            </CardContent>
          </Card>

          {/* SMS recipients */}
          <SmsRecipientsCard
            studentId={student.id}
            contacts={smsContacts}
            flagged={student.smsFlagged}
            flagReason={student.smsFlagReason}
          />

          {/* Quick info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-400" />
                Additional
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {student.placeOfBirth && (
                <div className="flex items-center gap-2 text-slate-600">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {student.placeOfBirth}
                </div>
              )}
              {student.dateOfBirth && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {fmtDisplayDate(student.dateOfBirth)}
                </div>
              )}
              {student.idCardNumber && (
                <div className="flex items-center gap-2 text-slate-600">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {student.idCardNumber}
                </div>
              )}
              {!student.placeOfBirth && !student.dateOfBirth && !student.idCardNumber && (
                <p className="text-slate-400">No additional info</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className={`text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>
        {value ?? <span className="text-slate-300">—</span>}
      </dd>
    </div>
  );
}

function AttStat({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${bg}`}>
      <span className={`text-sm font-medium ${color}`}>{label}</span>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
    </div>
  );
}
