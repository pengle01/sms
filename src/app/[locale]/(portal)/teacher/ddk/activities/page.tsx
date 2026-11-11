import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { Card, CardContent } from "@/components/ui/card";
import { fmtDisplayDate } from "@/lib/dates";
import { staffDisplayName } from "@/lib/staffName";
import { CONVERTIBLE_CATALOG, DDK_SECTIONS, ddkCategoryLabel } from "@/lib/ddk";
import { ddkActivityWhere, hasStudentScope, parseDdkActivityFilters, summarizeActivityAwards } from "@/lib/ddkActivities";

/** At most this many activities are listed; the count says when there are more. */
const LIMIT = 500;

/**
 * The ΔΔΚ coordinator's list of every filed activity: who filed it, its
 * students, and whether it was converted to ΔΔΚ points (category and points).
 * Filters: status, teacher, category, class or student.
 */
export default async function DdkActivitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const auth = await getActiveAuth();
  if (!auth || !isEducator(auth.role)) redirect(`/${locale}/login/staff`);
  const staff = await db.staffProfile.findUnique({ where: { userId: auth.userId }, select: { ddkCoordinator: true } });
  if (!staff?.ddkCoordinator && !auth.roles.includes("SUPER_ADMIN")) redirect(`/${locale}/teacher/dashboard`);

  const f = parseDdkActivityFilters(sp);
  const where = ddkActivityWhere(f);
  const [t, total, activities, filers, groups] = await Promise.all([
    getTranslations("ddkActivities"),
    db.activity.count({ where }),
    db.activity.findMany({
      where,
      select: {
        id: true,
        name: true,
        date: true,
        startPeriod: true,
        endPeriod: true,
        filer: { select: { scheduleName: true, user: { select: { name: true } } } },
        _count: { select: { participants: true, ddkAwards: true } },
        ddkAwards: {
          select: {
            categoryCode: true,
            points: true,
            student: {
              select: { groupId: true, studentId: true, user: { select: { name: true } }, group: { select: { grade: true } } },
            },
          },
        },
      },
      orderBy: [{ date: "desc" }, { startPeriod: "asc" }],
      take: LIMIT,
    }),
    db.staffProfile.findMany({
      where: { filedActivities: { some: {} } },
      select: { id: true, scheduleName: true, user: { select: { name: true } } },
      orderBy: { scheduleName: "asc" },
    }),
    db.group.findMany({
      where: { students: { some: {} } },
      select: { id: true, name: true, grade: true },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
    }),
  ]);
  const converted = activities.filter((a) => a._count.ddkAwards > 0).length;
  const scoped = hasStudentScope(f);
  const summaries = new Map(
    activities.map((a) => [
      a.id,
      summarizeActivityAwards(
        a.ddkAwards.map((w) => ({
          points: w.points,
          categoryCode: w.categoryCode,
          student: {
            groupId: w.student.groupId,
            grade: w.student.group?.grade ?? null,
            name: w.student.user?.name ?? "",
            registryNo: w.student.studentId,
          },
        })),
        f,
      ),
    ]),
  );
  const totalPoints = [...summaries.values()].reduce((s, x) => s + x.total, 0);
  const scopedPoints = [...summaries.values()].reduce((s, x) => s + (x.scoped?.points ?? 0), 0);
  const select = "h-9 px-2 rounded-lg border border-slate-200 bg-white text-sm max-w-full";

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/${locale}/teacher/ddk`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" />
          ΔΔΚ
        </Link>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
        <p className="text-slate-400 text-xs mt-1">{t("reportNote")}</p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-xs font-semibold text-slate-400">{t("filterStatus")}</span>
              <select name="status" defaultValue={f.status} className={select}>
                <option value="all">{t("statusAll")}</option>
                <option value="converted">{t("statusConverted")}</option>
                <option value="pending">{t("statusPending")}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-semibold text-slate-400">{t("filterFiler")}</span>
              <select name="filer" defaultValue={f.filer ?? ""} className={select}>
                <option value="">{t("any")}</option>
                {filers.map((s) => (
                  <option key={s.id} value={s.id}>{staffDisplayName(s)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-semibold text-slate-400">{t("filterCategory")}</span>
              <select name="category" defaultValue={f.category ?? ""} className={select}>
                <option value="">{t("any")}</option>
                {DDK_SECTIONS.filter((s) => CONVERTIBLE_CATALOG.some((c) => c.section === s.key)).map((s) => (
                  <optgroup key={s.key} label={s.label}>
                    <option value={`section:${s.key}`}>{t("wholeSection", { section: s.label })}</option>
                    {CONVERTIBLE_CATALOG.filter((c) => c.section === s.key).map((c) => (
                      <option key={c.code} value={c.code}>{c.code} · {c.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-semibold text-slate-400">{t("filterGrade")}</span>
              <select name="grade" defaultValue={f.grade ? String(f.grade) : ""} className={select}>
                <option value="">{t("any")}</option>
                {[1, 2, 3].map((g) => (
                  <option key={g} value={g}>{t("grade", { grade: g })}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-semibold text-slate-400">{t("filterGroup")}</span>
              <select name="groupId" defaultValue={f.groupId ?? ""} className={select}>
                <option value="">{t("any")}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-semibold text-slate-400">{t("filterStudent")}</span>
              <input name="q" defaultValue={f.q} placeholder={t("studentPlaceholder")} className={`${select} w-52`} />
            </label>
            <button type="submit" className="h-9 px-4 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700">
              {t("apply")}
            </button>
            <Link href="?" className="h-9 px-2 inline-flex items-center text-sm text-slate-400 hover:text-slate-700">
              {t("clear")}
            </Link>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-slate-600">
        {t("summary", { total, converted, pending: activities.length - converted })}
        {" · "}
        {t("totalPoints", { points: totalPoints })}
        {scoped && ` · ${t("scopedPoints", { points: scopedPoints })}`}
        {total > LIMIT && ` · ${t("capped", { limit: LIMIT })}`}
      </p>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-400">
                <th className="px-4 py-3">{t("colDate")}</th>
                <th className="px-4 py-3">{t("colActivity")}</th>
                <th className="px-4 py-3">{t("colFiler")}</th>
                <th className="px-4 py-3 text-center">{t("colStudents")}</th>
                <th className="px-4 py-3">{t("colDdk")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {activities.map((a) => {
                const sum = summaries.get(a.id)!;
                return (
                  <tr key={a.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDisplayDate(a.date)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/${locale}/teacher/activities/${a.id}`} className="font-medium text-slate-900 hover:text-emerald-700 hover:underline">
                        {a.name}
                      </Link>
                      <span className="block text-xs text-slate-400">
                        {a.startPeriod === a.endPeriod
                          ? t("period", { period: a.startPeriod })
                          : t("periods", { from: a.startPeriod, to: a.endPeriod })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{staffDisplayName(a.filer)}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-700">{a._count.participants}</td>
                    <td className="px-4 py-3">
                      {sum.category ? (
                        <span className="inline-flex flex-col rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                          <span className="font-semibold">
                            {sum.category} · {t("pointsTotal", { points: sum.total })}
                          </span>
                          <span className="text-emerald-700">{ddkCategoryLabel(sum.category)}</span>
                          <span className="text-emerald-600">
                            {t("awarded", { count: sum.students })} ·{" "}
                            {sum.min === sum.max ? t("perStudent", { points: sum.min }) : t("perStudentRange", { min: sum.min, max: sum.max })}
                          </span>
                          {sum.scoped && (
                            <span className="font-medium text-emerald-900">
                              {t("scopedLine", { students: sum.scoped.students, points: sum.scoped.points })}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                          {t("notConverted")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {activities.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">{t("none")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
