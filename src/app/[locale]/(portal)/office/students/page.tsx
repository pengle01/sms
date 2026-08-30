import { db } from "@/server/db";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { suggestionList } from "@/lib/textSearch";
import { SuggestInput } from "@/components/SuggestInput";
import { pickQueryString } from "@/lib/listFilters";
import {
  LOCATE_KEYS,
  initialLocateTab,
  locateHref,
  studentSearchWhere,
} from "@/lib/studentSearch";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The office student records list.
 *
 * Browsing by year and homegroup, the same way an educator finds a student —
 * a secretary asked about "the boy in ΕΓ1" should not have to already know his
 * name to reach his record. The name/ID tabs keep the old behaviour, and a bare
 * `?q=` link from before the tabs still lands on its results.
 */
export default async function OfficeStudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; grade?: string; groupId?: string; q?: string }>;
}) {
  const { locale } = await params;
  const { tab: tabParam, grade, groupId, q } = await searchParams;

  const tNav = await getTranslations("nav");
  const t = await getTranslations("locate");

  const tab = initialLocateTab(tabParam, q);
  const query = (q ?? "").trim();
  const gradeNum = grade ? parseInt(grade) : undefined;
  const current = { tab, grade, groupId, q: query };

  // Homegroups for the chosen year only — no point loading them for a name search.
  const groups =
    tab === "group" && gradeNum
      ? await db.group.findMany({
          where: { grade: gradeNum, students: { some: {} } },
          select: { id: true, name: true },
          orderBy: [{ grade: "asc" }, { name: "asc" }],
        })
      : [];

  // Null means "nothing chosen yet" — show the hint rather than the whole school.
  const where: Prisma.StudentProfileWhereInput | null =
    tab === "group"
      ? groupId
        ? { groupId, user: { isActive: true } }
        : null
      : studentSearchWhere(tab, query);

  const students = where
    ? await db.studentProfile.findMany({
        where,
        include: { user: { select: { name: true } }, group: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
        // A homegroup is a bounded list; a free-text search is not.
        ...(tab === "group" ? {} : { take: 50 }),
      })
    : [];

  // Autocomplete only for the tab that has a box, and over the field it searches.
  const suggestionRows =
    tab === "group"
      ? []
      : await db.studentProfile.findMany({
          where: { user: { isActive: true } },
          select: { studentId: true, user: { select: { name: true } } },
        });
  const suggestions = suggestionList(
    suggestionRows.map((s) => (tab === "name" ? s.user?.name : s.studentId)),
  );

  // Carried on every row link so the record's back button returns to this view.
  const listFilters = pickQueryString(current, LOCATE_KEYS);

  const tabs = [
    { key: "group", label: t("searchTabGroup") },
    { key: "name", label: t("searchTabName") },
    { key: "id", label: t("searchTabId") },
  ] as const;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">{tNav("students")}</h2>

      {/* Search mode tabs */}
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
          {/* Year */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("year")}</p>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3].map((g) => (
                <Link
                  key={g}
                  href={locateHref(current, {
                    grade: String(g),
                    groupId: g === gradeNum ? groupId : undefined,
                  })}
                  className={cn(
                    "h-10 px-6 rounded-xl text-sm font-medium transition-colors border",
                    gradeNum === g
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
                  )}
                >
                  {t("yearN", { n: g })}
                </Link>
              ))}
            </div>
          </div>

          {/* Homegroup */}
          {gradeNum && groups.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("homegroup")}</p>
              <div className="flex gap-2 flex-wrap">
                {groups.map((g) => (
                  <Link
                    key={g.id}
                    href={locateHref(current, { groupId: g.id })}
                    className={cn(
                      "h-10 px-5 rounded-xl text-sm font-medium transition-colors border",
                      groupId === g.id
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800"
                    )}
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {!gradeNum && <p className="text-sm text-slate-400">{t("selectYear")}</p>}
          {gradeNum && groups.length === 0 && (
            <p className="text-sm text-slate-400">{t("noHomegroups", { n: gradeNum })}</p>
          )}
        </>
      ) : (
        <form method="GET" className="flex gap-2 flex-wrap">
          <input type="hidden" name="tab" value={tab} />
          {/* Keep the group-tab selection alive while searching */}
          {grade && <input type="hidden" name="grade" value={grade} />}
          {groupId && <input type="hidden" name="groupId" value={groupId} />}
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <SuggestInput
              name="q"
              defaultValue={query}
              autoFocus
              placeholder={tab === "name" ? t("searchByName") : t("searchById")}
              suggestions={suggestions}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </form>
      )}

      {tab !== "group" && !query && <p className="text-sm text-slate-400">{t("enterSearch")}</p>}
      {where && students.length === 0 && <p className="text-sm text-slate-400">{t("noResults")}</p>}

      {students.length > 0 && (
        <>
          <p className="text-sm text-slate-400">{t("studentsCount", { count: students.length })}</p>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {students.map((s) => (
                  <Link
                    key={s.id}
                    href={`/${locale}/office/students/${s.id}${listFilters}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900">{s.user?.name}</p>
                      <p className="text-xs font-mono text-slate-400">{s.studentId}</p>
                    </div>
                    {s.group && <Badge variant="outline" className="text-xs">{s.group.name}</Badge>}
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
