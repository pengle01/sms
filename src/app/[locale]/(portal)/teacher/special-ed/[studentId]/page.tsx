import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { canViewSpecialEdFull } from "@/lib/specialEd";
import { getSpecialEdCatalog, getStudentSupport } from "@/server/specialEd";
import { EditSpecialEdForm } from "./EditSpecialEdForm";

const DOW = ["", "Δευ", "Τρί", "Τετ", "Πέμ", "Παρ"];

export default async function EditSpecialEdPage({
  params,
}: {
  params: Promise<{ locale: string; studentId: string }>;
}) {
  const { locale, studentId } = await params;

  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login`);
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { specialEducation: true },
  });
  if (!canViewSpecialEdFull(auth.roles, !!staff?.specialEducation)) {
    redirect(`/${locale}/teacher/dashboard`);
  }

  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: { id: true, studentId: true, user: { select: { name: true } }, group: { select: { name: true } } },
  });
  if (!student) notFound();

  const [catalog, record, support] = await Promise.all([
    getSpecialEdCatalog(),
    db.specialEdRecord.findUnique({
      where: { studentId },
      select: {
        fileNo: true,
        remarks: true,
        frenchExempt: true,
        otherExemptions: true,
        problems: { select: { code: true } },
        accommodations: { select: { code: true } },
      },
    }),
    getStudentSupport(studentId),
  ]);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start gap-3">
        <Link href={`/${locale}/teacher/special-ed`} className="text-slate-500 hover:text-slate-700 mt-1">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{student.user?.name ?? "—"}</h2>
          <div className="flex items-center gap-2 mt-1">
            {student.group && <Badge variant="outline">{student.group.name}</Badge>}
            <span className="font-mono text-xs text-slate-400">{student.studentId}</span>
          </div>
        </div>
      </div>

      <EditSpecialEdForm
        studentId={studentId}
        locale={locale}
        problemCatalog={catalog.problems}
        accommodationCatalog={catalog.accommodations}
        initial={{
          fileNo: record?.fileNo ?? "",
          remarks: record?.remarks ?? "",
          frenchExempt: record?.frenchExempt ?? false,
          otherExemptions: record?.otherExemptions ?? "",
          problemCodes: record?.problems.map((p) => p.code) ?? [],
          accommodationCodes: record?.accommodations.map((a) => a.code) ?? [],
        }}
        hasRecord={!!record}
      />

      {/* Derived support (read-only — comes from the timetable) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Στήριξη (από το ωρολόγιο πρόγραμμα)</CardTitle>
        </CardHeader>
        <CardContent>
          {support.length === 0 ? (
            <p className="text-sm text-slate-400">Καμία καταχωρημένη στήριξη.</p>
          ) : (
            <ul className="space-y-1">
              {support.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <Badge variant="outline" className={s.kind === "ATOMIC" ? "border-violet-200 text-violet-700" : "border-sky-200 text-sky-700"}>
                    {s.kind === "ATOMIC" ? "Ατομική" : "Ομαδική"}
                  </Badge>
                  <span className="font-medium">{s.subject}</span>
                  {s.teacher && <span className="text-slate-400">· {s.teacher}</span>}
                  <span className="text-slate-400 ml-auto">{DOW[s.dayOfWeek] ?? ""} {s.period}η</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
