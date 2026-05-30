import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { NewReferralDialog } from "./NewReferralDialog";
import { ResolveReferralDialog } from "./ResolveReferralDialog";
import { cn } from "@/lib/utils";
import { fmtDisplayDate } from "@/lib/dates";
import { getTranslations } from "next-intl/server";

type ReferralWithStudents = { isDraft: boolean; students: { status: string }[] };

// Overall status derived from per-student state (no Referral.status field).
function overallStatus(r: ReferralWithStudents): "DRAFT" | "PENDING" | "PARTIAL" | "RESOLVED" {
  if (r.isDraft) return "DRAFT";
  if (r.students.length === 0) return "PENDING";
  const resolved = r.students.filter((s) => s.status === "RESOLVED").length;
  if (resolved === 0) return "PENDING";
  if (resolved === r.students.length) return "RESOLVED";
  return "PARTIAL";
}

export default async function ReferralsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; group?: string; page?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/login`);

  const t = await getTranslations("referrals");
  const tCommon = await getTranslations("common");

  const { status: statusFilter, group: groupFilter, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1"));
  const limit = 20;

  // Status filter mapped to a derived where-fragment
  const statusWhere = (value?: string) => {
    if (value === "PENDING") return { isDraft: false, students: { some: { status: "PENDING" as const } } };
    if (value === "RESOLVED") return { isDraft: false, students: { every: { status: "RESOLVED" as const }, some: {} } };
    return {};
  };

  const where = {
    ...statusWhere(statusFilter && statusFilter !== "ALL" ? statusFilter : undefined),
    ...(groupFilter ? { students: { some: { groupId: groupFilter } } } : {}),
  };

  const [total, referrals, students, groups, groupSummary] = await Promise.all([
    db.referral.count({ where }),
    db.referral.findMany({
      where,
      include: {
        filer: { include: { user: { select: { name: true } } } },
        students: {
          include: {
            student: { include: { user: { select: { name: true } } } },
            group: { select: { name: true } },
            resolution: true,
          },
          orderBy: { student: { user: { name: "asc" as const } } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.studentProfile.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.group.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.group.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        referralStudents: { select: { id: true, status: true } },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  const statusBadge = (status: string) => {
    if (status === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
    if (status === "PARTIAL") return "bg-sky-50 text-sky-700 border-sky-200";
    if (status === "RESOLVED") return "bg-green-50 text-green-700 border-green-200";
    return "bg-slate-100 text-slate-500 border-slate-200";
  };

  const statusLabel = (status: string) => {
    if (status === "PENDING") return t("pending");
    if (status === "RESOLVED") return t("resolved");
    if (status === "PARTIAL") return "Μερικώς";
    if (status === "DRAFT") return "Πρόχειρο";
    return status;
  };

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: statusFilter, group: groupFilter, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "ALL") p.set(k, v);
    }
    const qs = p.toString();
    return qs ? `?${qs}` : "?";
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
          <p className="text-slate-500 text-sm mt-1">{t("total", { count: total })}</p>
        </div>
        <NewReferralDialog students={students} locale={locale} />
      </div>

      {/* Homegroup summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {groupSummary.map((g) => {
          const total = g.referralStudents.length;
          const pending = g.referralStudents.filter((rs) => rs.status === "PENDING").length;
          const isActive = groupFilter === g.id;
          return (
            <Link
              key={g.id}
              href={buildHref({ group: isActive ? undefined : g.id, page: undefined })}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "bg-white border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-700"
              )}
            >
              <p className="font-semibold truncate">{g.name}</p>
              <p className={cn("text-xs mt-0.5", isActive ? "text-emerald-100" : "text-slate-400")}>
                {t("total", { count: total })}
                {pending > 0 && (
                  <span className={cn("ml-1.5 font-semibold", isActive ? "text-amber-200" : "text-amber-600")}>
                    · {pending} {t("pending").toLowerCase()}
                  </span>
                )}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Filters */}
      <form method="GET" className="flex gap-3 flex-wrap items-center">
        {groupFilter && <input type="hidden" name="group" value={groupFilter} />}
        <select
          name="status"
          defaultValue={statusFilter ?? "ALL"}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="ALL">{t("allStatuses")}</option>
          <option value="PENDING">{t("pending")}</option>
          <option value="RESOLVED">{t("resolved")}</option>
        </select>
        <select
          name="group"
          defaultValue={groupFilter ?? ""}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">{t("allHomegroups")}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          {tCommon("filter")}
        </button>
        {(statusFilter || groupFilter) && (
          <Link href="?" className="h-9 px-3 flex items-center text-sm text-slate-500 hover:text-slate-800">
            {tCommon("clear")}
          </Link>
        )}
      </form>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {groupFilter
              ? t("groupLog", { name: groups.find((g) => g.id === groupFilter)?.name ?? "Group" })
              : t("allReferrals")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("dateHeader")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{tCommon("student")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("description")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("filedBy")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("status")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("actionsHeader")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {referrals.map((r) => {
                const status = overallStatus(r);
                const pendingNames = r.students
                  .filter((rs) => rs.status === "PENDING")
                  .map((rs) => rs.student.user?.name ?? "")
                  .filter(Boolean);
                return (
                  <tr key={r.id} className="hover:bg-slate-50 align-top">
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                      {fmtDisplayDate(r.date)}
                    </td>
                    <td className="px-5 py-3.5 text-sm">
                      <div className="space-y-0.5">
                        {r.students.map((rs) => (
                          <div key={rs.id} className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-900">{rs.student.user?.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5">{rs.group?.name ?? "—"}</Badge>
                            {rs.status === "RESOLVED" && (
                              <Badge variant="outline" className="text-[10px] px-1.5 bg-green-50 text-green-700 border-green-200">
                                {rs.resolution ? rs.resolution.action.replace(/_/g, " ") : "✓"}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 max-w-xs">
                      <span className="line-clamp-2 text-sm">{r.description}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-sm">{r.filer.user?.name}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant="outline" className={`text-xs ${statusBadge(status)}`}>
                        {statusLabel(status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      {pendingNames.length > 0 && (
                        <ResolveReferralDialog referralId={r.id} studentName={pendingNames} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {referrals.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-slate-400">
                    <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {t("noReferrals")}
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
