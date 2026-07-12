import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Upload, Download, UserPlus, BookOpen } from "lucide-react";
import { canViewSpecialEdFull } from "@/lib/specialEd";
import { listSpecialEdStudents, listSpecialEdForTeacher, specialEdLegend, type TeacherSpecialEdStudent } from "@/server/specialEd";

// The special-ed coordinator's desk: the cohort roster. Adding a student lives
// on its own page (./add) behind the header button. Full-access only
// (deputy/counselor/headmaster).
export default async function SpecialEdDeskPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true, specialEducation: true },
  });
  const full = canViewSpecialEdFull(auth.roles, !!staff?.specialEducation);

  // ── Regular teacher: read-only view of the students THEY teach, with codes,
  // accommodations and a legend. Scoped to their own groups (same boundary as
  // the audited dossier reveal). Full-access roles fall through to the desk. ──
  if (!full) {
    if (!staff) redirect(`/${locale}/teacher/dashboard`);
    // No audit here: a server render fires on prefetch too, so auditing this
    // read would spam/falsify the trail. The dossier codes-reveal stays audited.
    const myStudents = await listSpecialEdForTeacher(staff.id);
    const legend = specialEdLegend(myStudents);
    return <TeacherSpecialEdView students={myStudents} legend={legend} />;
  }

  const cohort = await listSpecialEdStudents();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-600" />
            Ειδική Αγωγή
          </h2>
          <p className="text-slate-500 text-sm mt-1">{cohort.length} μαθητές/τριες</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/${locale}/teacher/special-ed/add`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            <UserPlus className="w-4 h-4" />
            Προσθήκη μαθητή
          </Link>
          <Link
            href={`/${locale}/teacher/special-ed/export`}
            prefetch={false}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            <Download className="w-4 h-4" />
            Εξαγωγή
          </Link>
          <Link
            href={`/${locale}/teacher/special-ed/import`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            <Upload className="w-4 h-4" />
            Εισαγωγή
          </Link>
        </div>
      </div>

      {/* Cohort roster */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Μαθητής/τρια</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Τμήμα</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Κωδικοί προβλημάτων</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Διευκολύνσεις</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cohort.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400">Κανένας μαθητής ακόμη.</td></tr>
              ) : (
                cohort.map((s) => (
                  <tr key={s.studentId} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/${locale}/teacher/special-ed/${s.studentId}`} className="font-medium text-slate-900 hover:text-emerald-700">
                        {s.name}
                      </Link>
                      <span className="ml-2 font-mono text-[11px] text-slate-400">{s.registryNo}</span>
                    </td>
                    <td className="px-4 py-3">{s.group ? <Badge variant="outline" className="text-xs">{s.group}</Badge> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.problemCodes.length === 0 ? <span className="text-slate-300">—</span> :
                          s.problemCodes.map((c) => <Badge key={c} variant="outline" className="text-xs font-semibold">{c}</Badge>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{s.accommodationCodes.join(", ") || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/** Read-only special-ed view for a teacher: the students they teach + a legend. */
function TeacherSpecialEdView({
  students,
  legend,
}: {
  students: TeacherSpecialEdStudent[];
  legend: { problems: { code: string; label: string }[]; accommodations: { code: string; label: string }[] };
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-amber-600" />
          Ειδική Αγωγή
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Στοιχεία ειδικής αγωγής των μαθητών/τριών που διδάσκετε · {students.length}
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-2.5 text-xs text-amber-800">
        <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>Εμπιστευτικά στοιχεία. Προβάλλονται μόνο οι μαθητές/τριες που διδάσκετε και η πρόσβαση καταγράφεται.</span>
      </div>

      {students.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-slate-400">
            <ShieldAlert className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Κανένας μαθητής/τρια με στοιχεία ειδικής αγωγής στα τμήματά σας.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Code legend */}
          {(legend.problems.length > 0 || legend.accommodations.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-slate-400" />
                  Επεξήγηση κωδικών
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Κωδικοί προβλημάτων</p>
                  {legend.problems.length === 0 ? (
                    <p className="text-sm text-slate-300">—</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {legend.problems.map((c) => (
                        <li key={c.code} className="flex gap-2 text-sm">
                          <Badge variant="outline" className="font-semibold flex-shrink-0">{c.code}</Badge>
                          <span className="text-slate-600">{c.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Διευκολύνσεις</p>
                  {legend.accommodations.length === 0 ? (
                    <p className="text-sm text-slate-300">—</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {legend.accommodations.map((c) => (
                        <li key={c.code} className="flex gap-2 text-sm">
                          <Badge variant="outline" className="font-semibold flex-shrink-0">{c.code}</Badge>
                          <span className="text-slate-600">{c.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-student records */}
          <div className="space-y-3">
            {students.map((s) => (
              <Card key={s.studentId} className="border-amber-100">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{s.name}</span>
                    {s.group && <Badge variant="outline" className="text-xs">{s.group}</Badge>}
                    <span className="font-mono text-[11px] text-slate-400">{s.registryNo}</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Κωδικοί προβλημάτων</p>
                      {s.problems.length === 0 ? (
                        <span className="text-sm text-slate-300">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {s.problems.map((c) => (
                            <Badge key={c.code} variant="outline" className="font-normal" title={c.label}>
                              <span className="font-semibold">{c.code}</span>
                              <span className="ml-1.5 text-slate-500">{c.label}</span>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Διευκολύνσεις</p>
                      {s.accommodations.length === 0 ? (
                        <span className="text-sm text-slate-300">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {s.accommodations.map((c) => (
                            <Badge key={c.code} variant="outline" className="font-normal" title={c.label}>
                              <span className="font-semibold">{c.code}</span>
                              <span className="ml-1.5 text-slate-500">{c.label}</span>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {(s.remarks || s.frenchExempt || s.otherExemptions) && (
                    <div className="space-y-1.5 border-t border-slate-100 pt-3">
                      {s.remarks && (
                        <p className="text-sm text-slate-700">
                          <span className="text-slate-400">Παρατηρήσεις: </span>
                          {s.remarks}
                        </p>
                      )}
                      {s.frenchExempt && (
                        <Badge variant="outline" className="text-xs">Απαλλαγή Γαλλικών</Badge>
                      )}
                      {s.otherExemptions && (
                        <p className="text-sm text-slate-700">
                          <span className="text-slate-400">Άλλες απαλλαγές: </span>
                          {s.otherExemptions}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
