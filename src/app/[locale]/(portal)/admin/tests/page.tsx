import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { Card, CardContent } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { utcMidnight, fmtDisplayDate, localDateStr, normalizeIsoDate } from "@/lib/dates";
import { staffDisplayName } from "@/lib/staffName";
import { cn } from "@/lib/utils";
import { AdminDeleteTestButton } from "./AdminDeleteTestButton";

const PAGE_SIZE = 50;

/** Every scheduled test, past and upcoming — the admin may delete any. */
export default async function AdminTestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string; groupId?: string; q?: string; page?: string }>;
}) {
  const { locale } = await params;
  if (!(await getSuperAdminAuth())) redirect(`/${locale}/login/staff`);
  const t = await getTranslations("adminTests");
  const sp = await searchParams;
  const from = normalizeIsoDate(sp.from);
  const to = normalizeIsoDate(sp.to);
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const todayIso = localDateStr();

  const where = {
    ...(from || to
      ? { date: { ...(from ? { gte: utcMidnight(from) } : {}), ...(to ? { lte: utcMidnight(to) } : {}) } }
      : {}),
    ...(sp.groupId ? { groupId: sp.groupId } : {}),
    ...(q
      ? {
          OR: [
            { course: { name: { contains: q, mode: "insensitive" as const } } },
            { staff: { scheduleName: { contains: q, mode: "insensitive" as const } } },
            { staff: { user: { name: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const [tests, total, groups] = await Promise.all([
    db.testSchedule.findMany({
      where,
      include: {
        course: { select: { name: true } },
        group: { select: { name: true } },
        staff: { select: { scheduleName: true, user: { select: { name: true } } } },
        _count: { select: { testGrades: true } },
      },
      orderBy: [{ date: "desc" }, { period: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.testSchedule.count({ where }),
    db.group.findMany({
      where: { testSchedules: { some: {} } },
      select: { id: true, name: true },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (sp.groupId) qs.set("groupId", sp.groupId);
    if (q) qs.set("q", q);
    qs.set("page", String(p));
    return `?${qs.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("intro")}</p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="tests-from" className="block text-xs text-slate-500 mb-1">{t("from")}</label>
          <DateInput id="tests-from" name="from" defaultValue={from ?? ""} className="h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white" />
        </div>
        <div>
          <label htmlFor="tests-to" className="block text-xs text-slate-500 mb-1">{t("to")}</label>
          <DateInput id="tests-to" name="to" defaultValue={to ?? ""} className="h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white" />
        </div>
        <div>
          <label htmlFor="tests-group" className="block text-xs text-slate-500 mb-1">{t("group")}</label>
          <select id="tests-group" name="groupId" defaultValue={sp.groupId ?? ""} className="h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="">{t("allGroups")}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tests-q" className="block text-xs text-slate-500 mb-1">{t("search")}</label>
          <input id="tests-q" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="h-9 w-56 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <button type="submit" className="h-9 px-4 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700">
          {t("filter")}
        </button>
        {(from || to || sp.groupId || q) && (
          <Link href="?" className="h-9 inline-flex items-center text-sm text-slate-500 hover:text-slate-700">{t("clear")}</Link>
        )}
      </form>

      <p className="text-sm text-slate-500">{t("count", { total })}</p>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {tests.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">{t("none")}</p>
          ) : (
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2.5">{t("colDate")}</th>
                  <th className="px-4 py-2.5">{t("colPeriod")}</th>
                  <th className="px-4 py-2.5">{t("colCourse")}</th>
                  <th className="px-4 py-2.5">{t("colGroup")}</th>
                  <th className="px-4 py-2.5">{t("colTeacher")}</th>
                  <th className="px-4 py-2.5">{t("colType")}</th>
                  <th className="px-4 py-2.5">{t("colGrades")}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tests.map((x) => {
                  const iso = x.date.toISOString().slice(0, 10);
                  const past = iso < todayIso;
                  return (
                    <tr key={x.id} className={cn(past && "text-slate-500")}>
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                        {fmtDisplayDate(x.date)}
                        {!past && <span className="ml-2 text-[11px] font-medium text-emerald-600">{t("upcoming")}</span>}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {x.periodCount > 1 ? `Π${x.period}–${x.period + x.periodCount - 1}` : `Π${x.period}`}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{x.course.name}</td>
                      <td className="px-4 py-2.5">{x.group.name}</td>
                      <td className="px-4 py-2.5">{staffDisplayName(x.staff)}</td>
                      <td className="px-4 py-2.5">{x.type === "BIG" ? t("typeBig") : t("typeSmall")}</td>
                      <td className="px-4 py-2.5 tabular-nums">{x._count.testGrades || "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <AdminDeleteTestButton testId={x.id} grades={x._count.testGrades} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          {page > 1 && <Link href={pageHref(page - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">←</Link>}
          <span className="text-slate-500">{t("page", { page, pages })}</span>
          {page < pages && <Link href={pageHref(page + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">→</Link>}
        </div>
      )}
    </div>
  );
}
