import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Search, Upload } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { pickQueryString } from "@/lib/listFilters";
import { suggestionList } from "@/lib/textSearch";
import { SuggestInput } from "@/components/SuggestInput";
import { StudentRow } from "./student-row";
import { GenerateAllCodesButton } from "./GenerateAllCodesButton";

export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ search?: string; grade?: string; groupId?: string; page?: string }>;
}) {
  const [{ locale }, { search, grade, groupId, page: pageStr }, adminAuth] = await Promise.all([
    params,
    searchParams,
    getSuperAdminAuth(),
  ]);

  const gradeNum = grade ? parseInt(grade) : undefined;
  const page = Math.max(1, parseInt(pageStr ?? "1"));
  const limit = 40;

  // Show table only when: all school (no grade filter), specific homegroup, or search active
  const showTable = !gradeNum || !!groupId || !!search;

  const [homeroomGroups, allTotal, missingCodes] = await Promise.all([
    gradeNum
      ? db.group.findMany({
          where: { grade: gradeNum, students: { some: {} } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    db.studentProfile.count(),
    db.studentProfile.count({ where: { accessCode: { is: null }, user: { isActive: true } } }),
  ]);

  const where = {
    ...(groupId ? { groupId } : gradeNum ? { group: { grade: gradeNum } } : {}),
    ...(search ? { user: { name: { contains: search, mode: "insensitive" as const } } } : {}),
  };

  const [total, students] = showTable
    ? await Promise.all([
        db.studentProfile.count({ where }),
        db.studentProfile.findMany({
          where,
          include: {
            user: { select: { name: true, email: true, isActive: true } },
            group: true,
          },
          orderBy: !gradeNum && !groupId
            ? [{ group: { grade: "asc" } }, { group: { name: "asc" } }, { user: { name: "asc" } }]
            : { user: { name: "asc" } },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ])
    : [0, []];

  const totalPages = Math.ceil(total / limit);

  // Autocomplete: student names scoped to the selected homegroup/year
  const suggestionRows = await db.studentProfile.findMany({
    where: {
      ...(groupId ? { groupId } : gradeNum ? { group: { grade: gradeNum } } : {}),
      user: { isActive: true },
    },
    select: { user: { select: { name: true } } },
  });
  const suggestions = suggestionList(suggestionRows.map((s) => s.user?.name));

  const buildHref = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { grade: grade ?? "", groupId: groupId ?? "", search: search ?? "", ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `?${p.toString()}`;
  };

  // Current filters travel with each row link so the detail page's "Back to
  // students" returns to exactly this view (pills, search, page intact).
  const listFilters = pickQueryString(
    { grade, groupId, search, page: page > 1 ? String(page) : undefined },
    ["grade", "groupId", "search", "page"]
  );

  const selectedGroup = groupId ? homeroomGroups.find((g) => g.id === groupId) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Students</h2>
          <p className="text-slate-500 text-sm mt-1">{allTotal} students enrolled</p>
        </div>
        {adminAuth && (
          <div className="flex items-center gap-2 flex-wrap">
            <GenerateAllCodesButton missing={missingCodes} />
            <Link
              href={`/${locale}/admin/students/import`}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
            >
              <Upload className="w-4 h-4" />
              Import students
            </Link>
            <Link
              href={`/${locale}/admin/students/enrollment`}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
            >
              <Upload className="w-4 h-4" />
              Import enrollment
            </Link>
          </div>
        )}
      </div>

      {/* Year selector */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Year</p>
        <div className="flex gap-2 flex-wrap">
          <Link
            href={buildHref({ grade: undefined, groupId: undefined, page: undefined })}
            className={cn(
              "h-9 px-5 rounded-xl text-sm font-medium border transition-colors",
              !gradeNum
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
            )}
          >
            All school
          </Link>
          {[1, 2, 3].map((g) => (
            <Link
              key={g}
              href={buildHref({ grade: String(g), groupId: undefined, page: undefined })}
              className={cn(
                "h-9 px-5 rounded-xl text-sm font-medium border transition-colors",
                gradeNum === g
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
              )}
            >
              Year {g}
            </Link>
          ))}
        </div>
      </div>

      {/* Homegroup selector */}
      {gradeNum && homeroomGroups.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Homegroup</p>
          <div className="flex gap-2 flex-wrap">
            {homeroomGroups.map((g) => (
              <Link
                key={g.id}
                href={buildHref({ groupId: g.id === groupId ? undefined : g.id, page: undefined })}
                className={cn(
                  "h-9 px-4 rounded-xl text-sm font-medium border transition-colors",
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

      {/* Search */}
      <form method="GET" className="flex gap-2">
        {gradeNum && <input type="hidden" name="grade" value={gradeNum} />}
        {groupId && <input type="hidden" name="groupId" value={groupId} />}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <SuggestInput
            name="search"
            defaultValue={search}
            placeholder="Search by name…"
            suggestions={suggestions}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        {search && (
          <Link
            href={buildHref({ search: undefined, page: undefined })}
            className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-400 hover:text-slate-700 flex items-center"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Results label + Table — only when a homegroup or All school is selected */}
      {!showTable && (
        <p className="text-sm text-slate-400 py-4 text-center">Select a homegroup to view students</p>
      )}

      {showTable && (
      <p className="text-sm text-slate-500">
        {selectedGroup ? (
          <><span className="font-medium text-slate-700">{selectedGroup.name}</span> · </>
        ) : gradeNum ? (
          <><span className="font-medium text-slate-700">Year {gradeNum}</span> · </>
        ) : null}
        {total} student{total !== 1 ? "s" : ""}
        {search && <> matching &ldquo;{search}&rdquo;</>}
      </p>
      )}

      {showTable && (
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">ID</th>
                {!groupId && <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Group</th>}
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students.map((s) => (
                <StudentRow key={s.id} href={`/${locale}/admin/students/${s.id}${listFilters}`}>
                  <td className="px-5 py-3 font-medium text-slate-900">{s.user?.name}</td>
                  <td className="px-5 py-3 text-slate-500 font-mono text-xs">{s.studentId}</td>
                  {!groupId && (
                    <td className="px-5 py-3">
                      {s.group
                        ? <Badge variant="outline" className="text-xs">{s.group.name}</Badge>
                        : <span className="text-slate-300">—</span>}
                    </td>
                  )}
                  <td className="px-5 py-3">
                    <Badge
                      variant="outline"
                      className={s.user.isActive
                        ? "bg-green-50 text-green-700 border-green-200 text-xs"
                        : "bg-red-50 text-red-700 border-red-200 text-xs"}
                    >
                      {s.user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                </StudentRow>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={groupId ? 3 : 4} className="px-5 py-16 text-center text-slate-400">
                    <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    No students found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      )}

      {/* Pagination */}
      {showTable && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={buildHref({ page: String(page - 1) })}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={buildHref({ page: String(page + 1) })}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
