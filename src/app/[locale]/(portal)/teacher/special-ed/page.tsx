import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Upload, Download, Search, Pencil, UserPlus } from "lucide-react";
import { canViewSpecialEdFull } from "@/lib/specialEd";
import { listSpecialEdStudents } from "@/server/specialEd";
import { studentNameOrIdWhere } from "@/lib/studentSearch";

// The special-ed coordinator's desk: the cohort roster + a search to add a
// student, plus the Excel import. Full-access only (deputy/counselor/headmaster).
export default async function SpecialEdDeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login`);
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { specialEducation: true },
  });
  if (!canViewSpecialEdFull(auth.roles, !!staff?.specialEducation)) {
    redirect(`/${locale}/teacher/dashboard`);
  }

  const cohort = await listSpecialEdStudents();

  // Student search to add someone to the cohort (name or registry number).
  const results = query
    ? await db.studentProfile.findMany({
        where: { ...studentNameOrIdWhere(query), user: { isActive: true } },
        select: {
          id: true,
          studentId: true,
          user: { select: { name: true } },
          group: { select: { name: true } },
          specialEd: { select: { id: true } },
        },
        orderBy: { user: { name: "asc" } },
        take: 25,
      })
    : [];

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
            href="#add-student"
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

      {/* Add a student to the cohort */}
      <Card id="add-student">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Προσθήκη μαθητή
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Αναζητήστε έναν εγγεγραμμένο μαθητή με όνομα ή Αριθμό Μητρώου και ανοίξτε την καρτέλα του για να καταχωρήσετε στοιχεία ειδικής αγωγής.
          </p>
          <form method="GET" className="flex gap-2 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                name="q"
                defaultValue={query}
                placeholder="Όνομα ή Αρ. Μητρ.…"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900"
            >
              <Search className="w-4 h-4" />
              Αναζήτηση
            </button>
          </form>

          {query && (
            <div className="rounded-lg border border-slate-100 divide-y divide-slate-50">
              {results.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-slate-400">Κανένα αποτέλεσμα.</p>
              ) : (
                results.map((s) => (
                  <Link
                    key={s.id}
                    href={`/${locale}/teacher/special-ed/${s.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{s.user?.name ?? "—"}</span>
                    {s.group && <Badge variant="outline" className="text-xs">{s.group.name}</Badge>}
                    <span className="font-mono text-xs text-slate-400">{s.studentId}</span>
                    {s.specialEd && (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Ήδη καταχωρημένος</Badge>
                    )}
                    <Pencil className="w-4 h-4 text-slate-300 ml-auto" />
                  </Link>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
