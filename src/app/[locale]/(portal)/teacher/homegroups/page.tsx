import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Search, Users } from "lucide-react";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { isHomegroupWhere } from "@/lib/homegroupFilter";
import { staffDisplayName } from "@/lib/staffName";
import { filterHomegroupRows } from "@/lib/homegroupStaff";
import { suggestionList } from "@/lib/textSearch";
import { SuggestInput } from "@/components/SuggestInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const staffSelect = { select: { id: true, scheduleName: true, user: { select: { name: true } } } } as const;

/**
 * Who looks after each homegroup — homegroup teacher, deputy (Β.Δ.) and
 * counselor — for every educator to look up. View only; the admin assigns
 * them on Admin → Τμήματα.
 */
export default async function HomegroupStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth || !isEducator(auth.role)) redirect(`/${locale}/login/staff`);
  const q = ((await searchParams).q ?? "").trim();

  const t = await getTranslations("homegroupStaff");
  const tLocate = await getTranslations("locate");

  const [groups, me] = await Promise.all([
    db.group.findMany({
      where: isHomegroupWhere(),
      select: {
        id: true,
        name: true,
        grade: true,
        homeroomTeacher: staffSelect,
        homeroomHeadteacher: staffSelect,
        counselor: staffSelect,
        _count: { select: { students: { where: { user: { isActive: true } } } } },
      },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
    }),
    db.staffProfile.findUnique({ where: { userId: auth.userId }, select: { id: true } }),
  ]);

  const name = (s: { scheduleName: string | null; user: { name: string | null } | null } | null) =>
    s ? staffDisplayName(s, "") || null : null;
  const all = groups.map((g) => ({
    id: g.id,
    grade: g.grade,
    groupName: g.name,
    teacher: name(g.homeroomTeacher),
    headteacher: name(g.homeroomHeadteacher),
    counselor: name(g.counselor),
    students: g._count.students,
    mine:
      !!me &&
      [g.homeroomTeacher?.id, g.homeroomHeadteacher?.id, g.counselor?.id].includes(me.id),
  }));
  const rows = filterHomegroupRows(all, q);
  const grades = [...new Set(rows.map((r) => r.grade))].sort();
  const suggestions = suggestionList(all.flatMap((r) => [r.groupName, r.teacher, r.headteacher, r.counselor]));

  const th = "text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide";
  const dash = <span className="text-slate-300">—</span>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-6 h-6" />
          {t("title")}
        </h2>
        <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
      </div>

      <form method="GET" className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <SuggestInput
          name="q"
          defaultValue={q}
          minChars={2}
          placeholder={t("searchPlaceholder")}
          suggestions={suggestions}
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">{q ? t("noMatches") : t("empty")}</p>
      ) : (
        grades.map((grade) => (
          <Card key={grade}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{tLocate("yearN", { n: grade })}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className={th}>{t("colGroup")}</th>
                    <th className={th}>{t("colTeacher")}</th>
                    <th className={th}>{t("colHeadteacher")}</th>
                    <th className={th}>{t("colCounselor")}</th>
                    <th className={cn(th, "text-right")}>{t("colStudents")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows
                    .filter((r) => r.grade === grade)
                    .map((r) => (
                      <tr key={r.id} className={cn(r.mine && "bg-emerald-50/50")}>
                        <td className="px-4 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                          {r.groupName}
                          {r.mine && (
                            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                              {t("you")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{r.teacher ?? dash}</td>
                        <td className="px-4 py-2.5 text-slate-700">{r.headteacher ?? dash}</td>
                        <td className="px-4 py-2.5 text-slate-700">{r.counselor ?? dash}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{r.students}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
