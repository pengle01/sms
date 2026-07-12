import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { canViewSpecialEdFull } from "@/lib/specialEd";
import { getSpecialEdCatalog } from "@/server/specialEd";
import { parseLocateTab, locateHref, studentSearchWhere, type LocateParams, type LocateTab } from "@/lib/studentSearch";
import { suggestionList } from "@/lib/textSearch";
import { SuggestInput } from "@/components/SuggestInput";
import { EditSpecialEdForm } from "../[studentId]/EditSpecialEdForm";

// Add a student to the special-ed cohort: the same tabbed student locator as
// the duty desk / attendance-locate, with the full record form inline once a
// student is picked. Full-access only (deputy/counselor/headmaster).
export default async function SpecialEdAddPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; grade?: string; groupId?: string; q?: string; student?: string }>;
}) {
  const { locale } = await params;
  const { tab: tabParam, grade, groupId, q, student: selectedStudentId } = await searchParams;

  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { specialEducation: true },
  });
  if (!canViewSpecialEdFull(auth.roles, !!staff?.specialEducation)) {
    redirect(`/${locale}/teacher/special-ed`);
  }

  const tLocate = await getTranslations("locate");

  // ── Student locator: same tabbed search as the duty desk / attendance-locate.
  const tab = parseLocateTab(tabParam);
  const query = (q ?? "").trim();
  const gradeNum = grade ? parseInt(grade) : undefined;
  const current: LocateParams = { tab, grade, groupId, q: query };
  const currentQs = locateHref(current, {}).slice(1);
  // Selecting a student keeps the locator filters so the next student from the
  // same group is two clicks away.
  const selectHref = (studentId: string) => {
    const sp = new URLSearchParams(currentQs);
    sp.set("student", studentId);
    return `?${sp.toString()}`;
  };

  const matchesWhere =
    tab === "group"
      ? groupId
        ? { groupId, user: { isActive: true } }
        : null
      : studentSearchWhere(tab, query);

  const [homeroomGroups, matches, suggestionRows, selectedStudent] = await Promise.all([
    tab === "group" && gradeNum
      ? db.group.findMany({
          where: { grade: gradeNum, students: { some: {} } },
          orderBy: [{ grade: "asc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    matchesWhere
      ? db.studentProfile.findMany({
          where: matchesWhere,
          select: {
            id: true,
            studentId: true,
            user: { select: { name: true } },
            group: { select: { name: true } },
            specialEd: { select: { id: true } },
          },
          orderBy: { user: { name: "asc" } },
          ...(tab === "group" ? {} : { take: 50 }),
        })
      : Promise.resolve([]),
    tab === "group"
      ? Promise.resolve([])
      : db.studentProfile.findMany({
          where: { user: { isActive: true } },
          select: { studentId: true, user: { select: { name: true } } },
        }),
    selectedStudentId
      ? db.studentProfile.findFirst({
          where: { id: selectedStudentId, user: { isActive: true } },
          select: {
            id: true,
            studentId: true,
            user: { select: { name: true } },
            group: { select: { name: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  const suggestions = suggestionList(
    suggestionRows.map((s) => (tab === "name" ? s.user?.name : s.studentId))
  );
  const selectedGroup = groupId ? homeroomGroups.find((g) => g.id === groupId) ?? null : null;

  // The record form for the selected student.
  const [catalog, record] = selectedStudent
    ? await Promise.all([
        getSpecialEdCatalog(),
        db.specialEdRecord.findUnique({
          where: { studentId: selectedStudent.id },
          select: {
            fileNo: true,
            remarks: true,
            frenchExempt: true,
            otherExemptions: true,
            problems: { select: { code: true } },
            accommodations: { select: { code: true } },
          },
        }),
      ])
    : [null, null];

  const tabs: { key: LocateTab; label: string }[] = [
    { key: "group", label: tLocate("searchTabGroup") },
    { key: "name", label: tLocate("searchTabName") },
    { key: "id", label: tLocate("searchTabId") },
  ];

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start gap-3">
        <Link href={`/${locale}/teacher/special-ed`} className="text-slate-500 hover:text-slate-700 mt-1">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-emerald-600" />
            Προσθήκη μαθητή
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Επιλέξτε μαθητή — ανά τμήμα ή με αναζήτηση — και συμπληρώστε τα στοιχεία ειδικής αγωγής στη φόρμα που εμφανίζεται.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4" />
            Επιλογή μαθητή
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Locator tabs */}
          <div className="flex gap-1 border-b border-slate-200">
            {tabs.map((tb) => (
              <Link
                key={tb.key}
                href={locateHref(current, { tab: tb.key })}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === tb.key
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                )}
              >
                {tb.label}
              </Link>
            ))}
          </div>

          {tab === "group" ? (
            <>
              {/* Step 1 — Year */}
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3].map((g) => (
                  <Link
                    key={g}
                    /* Switching year clears the group selection (it belongs to the old year). */
                    href={locateHref(current, { grade: String(g), groupId: g === gradeNum ? groupId : undefined })}
                    className={cn(
                      "h-9 px-5 rounded-xl text-sm font-medium transition-colors border",
                      gradeNum === g
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
                    )}
                  >
                    {tLocate("yearN", { n: g })}
                  </Link>
                ))}
              </div>

              {/* Step 2 — Homegroup */}
              {gradeNum ? (
                homeroomGroups.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {homeroomGroups.map((g) => (
                      <Link
                        key={g.id}
                        href={locateHref(current, { groupId: g.id })}
                        className={cn(
                          "h-9 px-4 rounded-xl text-sm font-medium transition-colors border",
                          groupId === g.id
                            ? "bg-slate-800 text-white border-slate-800"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800"
                        )}
                      >
                        {g.name}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">{tLocate("noHomegroups", { n: gradeNum })}</p>
                )
              ) : (
                <p className="text-sm text-slate-400">{tLocate("selectYear")}</p>
              )}
            </>
          ) : (
            /* Name / registry-number search */
            <form method="GET" className="relative max-w-md">
              <input type="hidden" name="tab" value={tab} />
              {/* Keep the group-tab selection alive while searching */}
              {grade && <input type="hidden" name="grade" value={grade} />}
              {groupId && <input type="hidden" name="groupId" value={groupId} />}
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              <SuggestInput
                name="q"
                defaultValue={query}
                placeholder={tab === "name" ? tLocate("searchByName") : tLocate("searchById")}
                suggestions={suggestions}
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </form>
          )}

          {/* Matches — pick the student to record for */}
          {matchesWhere && (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {matches.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-400">{tLocate("noResults")}</p>
              ) : (
                matches.map((s) => (
                  <Link
                    key={s.id}
                    href={selectHref(s.id)}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50",
                      s.id === selectedStudent?.id && "bg-amber-50/70"
                    )}
                  >
                    <span className="font-medium text-slate-900">{s.user?.name ?? "—"}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {s.specialEd && (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Ήδη καταχωρημένος</Badge>
                      )}
                      {tab !== "group" && s.group?.name && (
                        <Badge variant="outline" className="text-xs">{s.group.name}</Badge>
                      )}
                      <span className="font-mono">{s.studentId}</span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          )}
          {tab !== "group" && !query && (
            <p className="text-sm text-slate-400">{tLocate("enterSearch")}</p>
          )}
          {tab === "group" && selectedGroup && matches.length > 0 && (
            <p className="text-xs text-slate-400 -mt-2">
              {selectedGroup.name} · {tLocate("studentsCount", { count: matches.length })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Record form for the selected student */}
      {selectedStudent && catalog && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5">
            <span className="font-semibold text-slate-900">{selectedStudent.user?.name ?? "—"}</span>
            {selectedStudent.group && (
              <Badge variant="outline" className="text-xs">{selectedStudent.group.name}</Badge>
            )}
            <span className="font-mono text-xs text-slate-400">{selectedStudent.studentId}</span>
            {record && (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Ήδη καταχωρημένος</Badge>
            )}
            <Link
              href={locateHref(current, {})}
              aria-label="Καθαρισμός επιλογής"
              className="ml-auto text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </Link>
          </div>
          <EditSpecialEdForm
            studentId={selectedStudent.id}
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
        </div>
      )}
    </div>
  );
}
