import { db } from "@/server/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronLeft, Pencil, User, Phone, Mail, Calendar, MapPin,
  CreditCard, Globe, Users, MessageSquare, BookOpen, Clock, Layers,
} from "lucide-react";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;

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
        orderBy: [{ active: "desc" }, { role: "asc" }],
      },
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

  const absentCount  = attendance.filter((a) => a.status === "ABSENT").length;
  const lateCount    = attendance.filter((a) => a.status === "LATE").length;
  const presentCount = attendance.filter((a) => a.status === "PRESENT").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/${locale}/admin/students`}
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
                <Field label="Date of birth"   value={student.dateOfBirth ? student.dateOfBirth.toLocaleDateString("el-CY") : null} />
                <Field label="Place of birth"  value={student.placeOfBirth} />
                <Field label="Nationality"     value={student.nationality} />
                <Field label="ID card"         value={student.idCardNumber} mono />
                <Field label="Passport"        value={student.passportNumber} mono />
                <Field label="Group"           value={group?.name ?? null} />
                <Field label="Email"           value={user.email} />
              </dl>
            </CardContent>
          </Card>

          {/* Parents */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                Parents / Guardian
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {parents.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-400 text-center">No parents on record</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {parents.map(({ parentProfile }) => (
                      <tr key={parentProfile.id}>
                        <td className="px-5 py-3 font-medium text-slate-900">{parentProfile.user?.name ?? "—"}</td>
                        <td className="px-5 py-3">
                          <Badge variant="outline" className="text-xs capitalize">
                            {parentProfile.role.toLowerCase()}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {parentProfile.phone
                            ? <a href={`tel:${parentProfile.phone}`} className="flex items-center gap-1 hover:text-emerald-600">
                                <Phone className="w-3 h-3" />{parentProfile.phone}
                              </a>
                            : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-5 py-3 text-slate-500 truncate max-w-[200px]">
                          {parentProfile.user.email.endsWith("@pending.sms")
                            ? <span className="text-slate-300 italic text-xs">pending</span>
                            : <a href={`mailto:${parentProfile.user.email}`} className="flex items-center gap-1 hover:text-emerald-600">
                                <Mail className="w-3 h-3" />{parentProfile.user.email}
                              </a>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

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
                          <span className={`font-semibold ${Number(g.value) >= 10 ? "text-green-700" : "text-red-600"}`}>
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

          {/* SMS contacts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                SMS contacts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {smsContacts.length === 0 ? (
                <p className="text-sm text-slate-400">None on record</p>
              ) : (
                smsContacts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${c.active ? "text-slate-900" : "text-slate-400 line-through"}`}>
                        {c.name}
                      </p>
                      <p className="text-slate-500 text-xs font-mono">{c.phone}</p>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize shrink-0">
                      {c.role.toLowerCase()}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

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
                  {student.dateOfBirth.toLocaleDateString("el-CY")}
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
