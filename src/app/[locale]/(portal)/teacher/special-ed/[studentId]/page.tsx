import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { pickQueryString } from "@/lib/listFilters";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Pencil, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { canViewSpecialEdFull, canManageSpecialEdRegister } from "@/lib/specialEd";
import { getTranslations } from "next-intl/server";
import { getSpecialEdCatalog, getStudentSupport } from "@/server/specialEd";
import { EditSpecialEdForm } from "./EditSpecialEdForm";
import { RecordSummary } from "./RecordSummary";

const DOW = ["", "Δευ", "Τρί", "Τετ", "Πέμ", "Παρ"];

export default async function EditSpecialEdPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; studentId: string }>;
  searchParams: Promise<{ grade?: string; code?: string; acc?: string; q?: string; edit?: string }>;
}) {
  const { locale, studentId } = await params;
  const sp = await searchParams;

  // The roster forwards its filters on each row link, so "back" returns to the
  // same year/code/search rather than to the unfiltered cohort.
  const filters = pickQueryString(sp, ["grade", "code", "acc", "q"]);
  const backHref = `/${locale}/teacher/special-ed${filters}`;
  const recordHref = `/${locale}/teacher/special-ed/${studentId}${filters}`;
  const editHref = `${recordHref}${filters ? "&" : "?"}edit=1`;

  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { specialEducation: true },
  });
  if (!canViewSpecialEdFull(auth.roles, !!staff?.specialEducation)) {
    redirect(`/${locale}/teacher/dashboard`);
  }
  // Reading the dossier and changing it are different rights: the counselor has
  // the first only, so they get the record as a summary rather than a form.
  const canEdit = canManageSpecialEdRegister(auth.roles, !!staff?.specialEducation);
  // Editing is a mode you turn on, not the default. A dossier of diagnoses and
  // accommodations should not sit in an open form every time it is opened, so
  // even the deputy who may change it gets the read-only summary first and has
  // to press «Επεξεργασία». The button only flips the view — the right to save
  // is still canManageSpecialEdRegister, enforced here and again in the action.
  const editing = canEdit && sp.edit === "1";

  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: { id: true, studentId: true, user: { select: { name: true } }, group: { select: { name: true } } },
  });
  if (!student) notFound();

  const t = await getTranslations("specialEd");

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
        <Link href={backHref} className="text-slate-500 hover:text-slate-700 mt-1">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-slate-900">{student.user?.name ?? "—"}</h2>
          <div className="flex items-center gap-2 mt-1">
            {student.group && <Badge variant="outline">{student.group.name}</Badge>}
            <span className="font-mono text-xs text-slate-400">{student.studentId}</span>
          </div>
        </div>
        {canEdit && (
          <Link
            href={editing ? recordHref : editHref}
            className={
              editing
                ? "inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-medium border bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                : "inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-medium border bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
            }
          >
            {editing ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            {editing ? t("doneEditing") : t("enableEditing")}
          </Link>
        )}
      </div>

      {editing && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {t("editingBanner")}
        </p>
      )}

      {editing ? (
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
      ) : (
        <RecordSummary
          record={record}
          problemCatalog={catalog.problems}
          accommodationCatalog={catalog.accommodations}
        />
      )}

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
