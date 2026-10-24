import { db } from "@/server/db";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronLeft, Pencil, User, Phone, Users, BookOpen, Clock, Layers, Star,
} from "lucide-react";
import { SmsRecipientsCard } from "@/components/students/SmsRecipientsCard";
import { parentCard } from "@/lib/smsContacts";
import { AccountsCard, type StudentAccount } from "@/components/students/AccountsCard";
import { DeleteStudentCard } from "@/components/students/DeleteStudentCard";
import { historyBlockers } from "@/lib/studentDelete";
import { loadStudentHistory } from "@/server/studentDelete";
import { pickQueryString } from "@/lib/listFilters";
import { AccessCodeCard } from "@/components/access/AccessCodeCard";
import { getMaxGuardiansPerStudent } from "@/lib/schoolConfig";
import { isPassing } from "@/lib/grades";
import { StudentTimetableCard } from "@/components/students/StudentTimetableCard";


export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ grade?: string; groupId?: string; search?: string; page?: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("adminStudents");

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
            include: {
              user: true,
              // Every child of the guardian — the card shows their other
              // children so multi-child parents are visible at a glance.
              children: {
                include: {
                  studentProfile: {
                    select: { id: true, user: { select: { name: true } }, group: { select: { name: true } } },
                  },
                },
              },
            },
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

  const history = await loadStudentHistory(id);

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
      otherChildren: parentProfile.children
        .filter((c) => c.studentProfile.id !== id)
        .map((c) => {
          const child = c.studentProfile;
          return child.group ? `${child.user?.name ?? "—"} (${child.group.name})` : child.user?.name ?? "—";
        }),
    })),
  ];
  const guardianClaims = student.accessCode?.guardianClaims ?? parents.length;

  // Parents/guardians as recorded by the import (SMS contacts) — people with a
  // name and a role. They become login accounts only when they activate their
  // access code; those are listed in the Accounts card below. The SMS number
  // is not a person: it marks which parent's phone is preferred (parentCard).
  const card = parentCard(smsContacts);

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
          {t("backToStudents")}
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
              {user.isActive ? t("active") : t("inactive")}
            </Badge>
            <Link
              href={`/${locale}/admin/students/${id}/edit`}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-200 text-sm text-slate-600 font-medium hover:bg-slate-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              {t("edit")}
            </Link>
          </div>
        </div>
      </div>

      <AccessCodeCard studentProfileId={id} canGenerate />

      <StudentTimetableCard
        studentProfileId={id}
        homegroupId={student.groupId}
        groupIds={[...(student.groupId ? [student.groupId] : []), ...subjectGroups.map((sg) => sg.groupId)]}
        checksHref={`/${locale}/admin/checks`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">

          {/* Personal information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                {t("personalInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <Field label={t("fullName")}       value={user.name} />
                <Field label={t("studentIdLabel")} value={student.studentId} mono />
                <Field label={t("gender")}         value={student.gender === "MALE" ? t("male") : student.gender === "FEMALE" ? t("female") : null} />
                <Field label={t("address")}        value={student.address} />
                <Field label={t("group")}          value={group?.name ?? null} />
                <Field label={t("email")}          value={user.email} />
              </dl>
            </CardContent>
          </Card>

          {/* Parents / Guardians — contacts from the import */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                {t("parentsGuardians")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {card.parents.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-400 text-center">{t("noParentsOnRecord")}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {card.parents.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{p.name}</p>
                        <Badge variant="outline" className="mt-0.5 text-xs">
                          {p.role === "FATHER" ? t("father") : p.role === "MOTHER" ? t("mother") : t("guardian")}
                        </Badge>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {p.phones.length === 0 ? (
                          <span className="text-sm text-slate-400">—</span>
                        ) : (
                          p.phones.map(({ phone, preferred }) => (
                            <span key={phone} className="flex items-center gap-2">
                              {preferred && (
                                <span
                                  title={t("preferredHint")}
                                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                                >
                                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                  {t("preferredNumber")}
                                </span>
                              )}
                              <a href={`tel:${phone}`} className="flex items-center gap-1 text-sm text-slate-700 hover:text-emerald-600">
                                <Phone className="w-3 h-3" />
                                {phone}
                              </a>
                            </span>
                          ))
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {(card.homePhones.length > 0 || card.unmatchedSms) && (
                <div className="px-5 py-3 border-t border-slate-100 space-y-1 text-sm text-slate-500">
                  {card.homePhones.map(({ phone, preferred }) => (
                    <p key={phone} className="flex items-center gap-2">
                      {t("homePhoneLine", { phone })}
                      {preferred && (
                        <span title={t("preferredHint")} className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                          {t("preferredNumber")}
                        </span>
                      )}
                    </p>
                  ))}
                  {card.unmatchedSms && <p className="text-amber-700">{t("smsUnmatched", { phone: card.unmatchedSms })}</p>}
                </div>
              )}
              {card.parents.length > 0 && (
                <p className="px-5 py-3 text-xs text-slate-400 border-t border-slate-50">{t("parentsImportNote")}</p>
              )}
            </CardContent>
          </Card>

          {/* Accounts — login accounts linked to this student (own + guardians) */}
          <AccountsCard
            studentProfileId={student.id}
            accounts={accounts}
            guardianClaims={guardianClaims}
            maxGuardians={maxGuardians}
            otherChildrenLabel={t("alsoGuardianOf")}
          />

          {/* Subject groups */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-400" />
                {t("subjectGroups", { count: subjectGroups.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {subjectGroups.length === 0 ? (
                <p className="text-sm text-slate-400">{t("noSubjectGroups")}</p>
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
                  {t("recentGrades")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("course")}</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("term")}</th>
                      <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("grade")}</th>
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
                {t("attendanceLast", { count: attendance.length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <AttStat label={t("present")} value={presentCount} color="text-green-700" bg="bg-green-50" />
              <AttStat label={t("late")}    value={lateCount}    color="text-amber-700" bg="bg-amber-50" />
              <AttStat label={t("absent")}  value={absentCount}  color="text-red-700"   bg="bg-red-50" />
            </CardContent>
          </Card>

          {/* SMS recipients */}
          <SmsRecipientsCard
            studentId={student.id}
            contacts={smsContacts}
            flagged={student.smsFlagged}
            flagReason={student.smsFlagReason}
          />
        </div>
      </div>

      <DeleteStudentCard
        studentProfileId={student.id}
        studentName={student.user?.name ?? student.studentId}
        registryNumber={student.studentId}
        isActive={student.user?.isActive ?? false}
        blockers={history ? historyBlockers(history) : []}
        listHref={`/${locale}/admin/students`}
      />
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
