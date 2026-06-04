import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, Search, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { isHomegroupWhere } from "@/lib/homegroupFilter";
import { suggestionList } from "@/lib/textSearch";
import { SuggestInput } from "@/components/SuggestInput";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";

export default async function GroupsDirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ search?: string; grade?: string; type?: string; page?: string }>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login`);

  const t = await getTranslations("groups");
  const tCommon = await getTranslations("common");

  const { search, grade, type, page: pageStr } = await searchParams;
  const gradeNum = grade ? parseInt(grade) : undefined;
  const page = Math.max(1, parseInt(pageStr ?? "1"));
  const limit = 40;

  const where = {
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    ...(gradeNum ? { grade: gradeNum } : {}),
    ...(type === "homegroup"
      ? isHomegroupWhere()
      : type === "subject"
        ? { NOT: isHomegroupWhere() }
        : {}),
  };

  const [total, groups, allNames] = await Promise.all([
    db.group.count({ where }),
    db.group.findMany({
      where,
      include: {
        _count: { select: { students: true, studentGroups: true } },
        homeroomTeacher: { include: { user: { select: { name: true } } } },
      },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    // Autocomplete: every group name (scoped to the active grade/type filters)
    db.group.findMany({
      where: { ...(gradeNum ? { grade: gradeNum } : {}) },
      select: { name: true },
    }),
  ]);

  const suggestions = suggestionList(allNames.map((g) => g.name));

  const totalPages = Math.ceil(total / limit);

  const buildHref = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { search: search ?? "", grade: grade ?? "", type: type ?? "", ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `?${qs}` : `/${locale}/admin/groups`;
  };

  const isHomegroup = (g: (typeof groups)[number]) =>
    g._count.students > 0 || !!g.homeroomTeacherId || !!g.homeroomHeadteacherId || !!g.counselorId;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("directoryTitle")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("groupsCount", { count: total })}</p>
      </div>

      {/* Search + filters */}
      <form method="GET" className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <SuggestInput
            name="search"
            defaultValue={search}
            placeholder={t("searchPlaceholder")}
            suggestions={suggestions}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <AutoSubmitSelect
          name="grade"
          defaultValue={grade ?? ""}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">{t("allYears")}</option>
          <option value="1">{t("year1")}</option>
          <option value="2">{t("year2")}</option>
          <option value="3">{t("year3")}</option>
        </AutoSubmitSelect>
        <AutoSubmitSelect
          name="type"
          defaultValue={type ?? ""}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">{t("typeAll")}</option>
          <option value="homegroup">{t("typeHomegroup")}</option>
          <option value="subject">{t("typeSubject")}</option>
        </AutoSubmitSelect>
        {(search || grade || type) && (
          <Link
            href={`/${locale}/admin/groups`}
            className="h-9 px-3 flex items-center text-sm text-slate-500 hover:text-slate-800"
          >
            {tCommon("clear")}
          </Link>
        )}
      </form>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colName")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colYear")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colType")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colStudents")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colEnrolled")}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {groups.map((g) => {
                const home = isHomegroup(g);
                return (
                  <tr key={g.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <Link
                        href={`/${locale}/admin/groups/${g.id}`}
                        className="font-semibold text-slate-800 hover:text-emerald-700"
                      >
                        {g.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{g.grade}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          home
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-50 text-slate-500 border-slate-200"
                        )}
                      >
                        {home ? t("typeHomegroup") : t("typeSubject")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{g._count.students}</td>
                    <td className="px-4 py-3 text-slate-500">{g._count.studentGroups}</td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/${locale}/admin/groups/${g.id}`}
                        className="text-slate-300 hover:text-slate-600 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-slate-400">
                    <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {t("noFilterResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{tCommon("pageOf", { page, total: totalPages })}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={buildHref({ page: String(page - 1) })}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                {tCommon("previous")}
              </Link>
            )}
            {page < totalPages && (
              <Link href={buildHref({ page: String(page + 1) })}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                {tCommon("next")}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
