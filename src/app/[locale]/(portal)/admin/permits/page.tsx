import { db } from "@/server/db";
import { DateInput } from "@/components/ui/date-input";
import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogOut, Printer } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { permitContactLabel } from "@/lib/exitPermit";
import { staffDisplayName } from "@/lib/staffName";

const PAGE_SIZE = 50;

export default async function AdminExitPermitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string; page?: string }>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login`);

  const t = await getTranslations("adminPermits");
  const { date: dateStr, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1") || 1);
  const where = dateStr ? { date: utcMidnight(dateStr) } : {};

  const [permits, total] = await Promise.all([
    db.exitPermit.findMany({
      where,
      include: {
        student: { include: { user: { select: { name: true } }, group: { select: { name: true } } } },
        issuer: { include: { user: { select: { name: true } } } },
        smsContact: { select: { name: true, role: true, phone: true } },
      },
      orderBy: { issuedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.exitPermit.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) =>
    `?${new URLSearchParams({ ...(dateStr ? { date: dateStr } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">
          {t("permitCount", { count: total })}
          {dateStr ? ` ${t("onDate", { date: fmtDisplayDate(utcMidnight(dateStr)) })}` : ` ${t("inTotal")}`}
          {` · ${t("issuedByNote")}`}
        </p>
      </div>

      {/* Filters */}
      <form method="GET" className="flex gap-3 flex-wrap">
        <DateInput
          name="date"
          defaultValue={dateStr ?? ""}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        />
        <button type="submit" className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
          {t("apply")}
        </button>
        {dateStr && (
          <Link href="?" className="h-9 px-3 flex items-center text-sm text-slate-500 hover:text-slate-800">
            {t("clear")}
          </Link>
        )}
      </form>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colDate")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colStudent")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colLeavesFrom")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colReason")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colContact")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colIssuedBy")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {permits.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                    {fmtDisplayDate(p.date)}
                    <span className="block text-xs text-slate-400">
                      {p.issuedAt.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Nicosia" })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{p.student.user?.name ?? "—"}</span>
                    {p.student.group?.name && (
                      <Badge variant="outline" className="ml-2 text-xs">{p.student.group.name}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">P{p.fromPeriod}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-56 truncate" title={p.reason}>{p.reason}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-64 truncate">
                    {permitContactLabel(p.smsContact, p.contactNote) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{staffDisplayName(p.issuer)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/teacher/duty/permits/${p.id}/print`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-emerald-700"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {t("print")}
                    </Link>
                  </td>
                </tr>
              ))}
              {permits.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-slate-400">
                    <LogOut className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{t("pageOf", { page, total: totalPages })}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="h-8 px-3 flex items-center rounded-lg border border-slate-200 hover:bg-slate-50">
                {t("previous")}
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="h-8 px-3 flex items-center rounded-lg border border-slate-200 hover:bg-slate-50">
                {t("next")}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
