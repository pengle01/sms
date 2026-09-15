import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Upload, Download, UserPlus, BookOpen } from "lucide-react";
import {
  canViewSpecialEdFull,
  canManageSpecialEdRegister,
  filterCohort,
  cohortCodes,
  cohortAccommodations,
  cohortSupportDays,
  cohortSupportPeriods,
  COHORT_KEYS,
} from "@/lib/specialEd";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { suggestionList } from "@/lib/textSearch";
import { SuggestInput } from "@/components/SuggestInput";
import { pickQueryString } from "@/lib/listFilters";
import { Search } from "lucide-react";
import {
  listSpecialEdStudents,
  listSpecialEdForTeacher,
  specialEdLegend,
  supportSlotsByStudent,
  type TeacherSpecialEdStudent,
} from "@/server/specialEd";

// The special-ed coordinator's desk: the cohort roster. Adding a student lives
// on its own page (./add) behind the header button. Full-access only
// (deputy/counselor/headmaster).
export default async function SpecialEdDeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ grade?: string; code?: string; acc?: string; day?: string; period?: string; q?: string }>;
}) {
  const { locale } = await params;
  const { grade, code, acc, day, period, q } = await searchParams;

  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true, specialEducation: true },
  });
  const full = canViewSpecialEdFull(auth.roles, !!staff?.specialEducation);
  // Reading the dossier and owning the register are different things.
  const canManageRegister = canManageSpecialEdRegister(auth.roles, !!staff?.specialEducation);

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

  const t = await getTranslations("specialEd");
  const tLocate = await getTranslations("locate");
  const tShared = await getTranslations("tests");
  // The one weekday array in the message files that is indexed to match a
  // slot's dayOfWeek for Mon-Fri; student/schedule reads it the same way.
  const DOW = tShared.raw("dow") as string[];

  const records = await listSpecialEdStudents();
  // One query for the whole cohort — getStudentSupport would be one per student.
  const slots = await supportSlotsByStudent(records.map((r) => r.studentId));
  const everyone = records.map((r) => ({ ...r, supportSlots: slots.get(r.studentId) ?? [] }));

  const gradeNum = grade ? parseInt(grade) : undefined;
  const dayNum = day ? parseInt(day) : undefined;
  // A period belongs to a day; without one it is meaningless, and switching day
  // clears it below.
  const periodNum = dayNum && period ? parseInt(period) : undefined;
  const query = (q ?? "").trim();
  const cohort = filterCohort(everyone, {
    grade: gradeNum, code, accommodation: acc, day: dayNum, period: periodNum, q: query,
  });
  const codes = cohortCodes(everyone);
  const accommodations = cohortAccommodations(everyone);
  const supportDays = cohortSupportDays(everyone);
  // Scoped to the chosen day, so the pills can never offer an empty period.
  const supportPeriods = dayNum ? cohortSupportPeriods(everyone, dayNum) : [];
  const suggestions = suggestionList(everyone.map((s) => s.name));
  const filtered = cohort.length !== everyone.length;

  const current = { grade, code, acc, day, period: periodNum ? String(periodNum) : undefined, q: query };
  const rowFilters = pickQueryString(current, COHORT_KEYS);
  const hrefWith = (over: Partial<Record<(typeof COHORT_KEYS)[number], string | undefined>>) =>
    pickQueryString({ ...current, ...over }, COHORT_KEYS) || "?";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-600" />
            Ειδική Αγωγή
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {filtered
              ? t("showingCount", { shown: cohort.length, total: everyone.length })
              : `${everyone.length} μαθητές/τριες`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canManageRegister && (
            <Link
              href={`/${locale}/teacher/special-ed/add`}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
            >
              <UserPlus className="w-4 h-4" />
              Προσθήκη μαθητή
            </Link>
          )}
          <Link
            href={`/${locale}/teacher/special-ed/export`}
            prefetch={false}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            <Download className="w-4 h-4" />
            Εξαγωγή
          </Link>
          {canManageRegister && (
            <Link
              href={`/${locale}/teacher/special-ed/import`}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              <Upload className="w-4 h-4" />
              Εισαγωγή
            </Link>
          )}
        </div>
      </div>

      {/* Filters — year, problem code, free text over name and registry number */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{tLocate("year")}</p>
          <div className="flex gap-2 flex-wrap">
            <Link
              href={hrefWith({ grade: undefined })}
              className={cn(
                "h-9 px-4 rounded-xl text-sm font-medium border transition-colors",
                !gradeNum
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700",
              )}
            >
              {tLocate("allYears")}
            </Link>
            {[1, 2, 3].map((g) => (
              <Link
                key={g}
                href={hrefWith({ grade: String(g) })}
                className={cn(
                  "h-9 px-4 rounded-xl text-sm font-medium border transition-colors",
                  gradeNum === g
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700",
                )}
              >
                {tLocate("yearN", { n: g })}
              </Link>
            ))}
          </div>
        </div>

        {codes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("filterProblem")}</p>
            <div className="flex gap-2 flex-wrap">
              <Link
                href={hrefWith({ code: undefined })}
                className={cn(
                  "h-9 px-4 rounded-xl text-sm font-medium border transition-colors",
                  !code
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800",
                )}
              >
                {t("allProblems")}
              </Link>
              {codes.map((c) => (
                <Link
                  key={c}
                  href={hrefWith({ code: c === code ? undefined : c })}
                  className={cn(
                    "h-9 px-3 rounded-xl text-sm font-semibold border transition-colors",
                    code === c
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800",
                  )}
                >
                  {c}
                </Link>
              ))}
            </div>
          </div>
        )}

        {accommodations.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("filterAccommodation")}</p>
            <div className="flex gap-2 flex-wrap">
              <Link
                href={hrefWith({ acc: undefined })}
                className={cn(
                  "h-9 px-4 rounded-xl text-sm font-medium border transition-colors",
                  !acc
                    ? "bg-sky-700 text-white border-sky-700"
                    : "bg-white text-slate-600 border-slate-200 hover:border-sky-400 hover:text-sky-700",
                )}
              >
                {t("allAccommodations")}
              </Link>
              {accommodations.map((a) => (
                <Link
                  key={a}
                  href={hrefWith({ acc: a === acc ? undefined : a })}
                  className={cn(
                    "h-9 px-3 rounded-xl text-sm font-semibold border transition-colors",
                    acc === a
                      ? "bg-sky-700 text-white border-sky-700"
                      : "bg-white text-slate-600 border-slate-200 hover:border-sky-400 hover:text-sky-700",
                  )}
                >
                  {a}
                </Link>
              ))}
            </div>
          </div>
        )}

        {supportDays.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("filterSupportDay")}</p>
            <div className="flex gap-2 flex-wrap">
              <Link
                href={hrefWith({ day: undefined, period: undefined })}
                className={cn(
                  "h-9 px-3 rounded-xl text-sm font-medium border transition-colors",
                  !dayNum
                    ? "bg-teal-700 text-white border-teal-700"
                    : "bg-white text-slate-600 border-slate-200 hover:border-teal-400 hover:text-teal-700",
                )}
              >
                {t("allDays")}
              </Link>
              {supportDays.map(({ day: d, count }) => (
                <Link
                  key={d}
                  // Switching day drops the period — it belonged to the old day.
                  href={hrefWith({ day: d === dayNum ? undefined : String(d), period: undefined })}
                  className={cn(
                    "h-9 px-3 rounded-xl text-sm font-medium border transition-colors",
                    dayNum === d
                      ? "bg-teal-700 text-white border-teal-700"
                      : "bg-white text-slate-600 border-slate-200 hover:border-teal-400 hover:text-teal-700",
                  )}
                >
                  {DOW[d] ?? d}
                  <span className="ml-1.5 text-xs opacity-70">{count}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {supportPeriods.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("filterSupportPeriod")}</p>
            <div className="flex gap-2 flex-wrap">
              <Link
                href={hrefWith({ period: undefined })}
                className={cn(
                  "h-9 px-3 rounded-xl text-sm font-medium border transition-colors",
                  !periodNum
                    ? "bg-teal-700 text-white border-teal-700"
                    : "bg-white text-slate-600 border-slate-200 hover:border-teal-400 hover:text-teal-700",
                )}
              >
                {t("allPeriods")}
              </Link>
              {supportPeriods.map(({ period: pr, count }) => (
                <Link
                  key={pr}
                  href={hrefWith({ period: pr === periodNum ? undefined : String(pr) })}
                  className={cn(
                    "h-9 px-3 rounded-xl text-sm font-medium border transition-colors",
                    periodNum === pr
                      ? "bg-teal-700 text-white border-teal-700"
                      : "bg-white text-slate-600 border-slate-200 hover:border-teal-400 hover:text-teal-700",
                  )}
                >
                  {t("periodN", { n: pr })}
                  <span className="ml-1.5 text-xs opacity-70">{count}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <form method="GET" className="flex items-end gap-2">
          {grade && <input type="hidden" name="grade" value={grade} />}
          {code && <input type="hidden" name="code" value={code} />}
          {acc && <input type="hidden" name="acc" value={acc} />}
          {dayNum && <input type="hidden" name="day" value={String(dayNum)} />}
          {periodNum && <input type="hidden" name="period" value={String(periodNum)} />}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <SuggestInput
              name="q"
              defaultValue={query}
              placeholder={t("searchPlaceholder")}
              suggestions={suggestions}
              className="h-9 w-64 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {filtered && (
            <Link
              href="?"
              className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-400 hover:text-slate-700 flex items-center"
            >
              {t("clearFilters")}
            </Link>
          )}
        </form>
      </div>

      {/* Cohort roster */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Μαθητής/τρια</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Τμήμα</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colSupport")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Κωδικοί προβλημάτων</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Διευκολύνσεις</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cohort.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                  {everyone.length === 0 ? "Κανένας μαθητής ακόμη." : t("noMatches")}
                </td></tr>
              ) : (
                cohort.map((s) => (
                  <tr key={s.studentId} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/${locale}/teacher/special-ed/${s.studentId}${rowFilters}`} className="font-medium text-slate-900 hover:text-emerald-700">
                        {s.name}
                      </Link>
                      <span className="ml-2 font-mono text-[11px] text-slate-400">{s.registryNo}</span>
                    </td>
                    <td className="px-4 py-3">{s.group ? <Badge variant="outline" className="text-xs">{s.group}</Badge> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {s.supportSlots.length === 0 ? (
                        <span className="text-slate-300">{t("noSupportShort")}</span>
                      ) : (
                        s.supportSlots
                          .map((sl) => `${DOW[sl.dayOfWeek] ?? sl.dayOfWeek} ${sl.period}`)
                          .join(", ")
                      )}
                    </td>
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
