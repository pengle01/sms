import { db } from "@/server/db";
import { staffDisplayName } from "@/lib/staffName";
import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { NewReferralDialog } from "./NewReferralDialog";
import { ReferralStatusBadge, ReferralGroupSignals, referralLeftAccentClass } from "@/components/referrals/ReferralStatusBadge";
import { StudentsDropdown } from "@/components/referrals/StudentsDropdown";
import { ReferralInfo } from "@/components/referrals/ReferralInfo";
import { fmtDisplayDate, fmtDisplayDateTime } from "@/lib/dates";
import { getTranslations } from "next-intl/server";
import { resolutionSummary, actionLabel } from "@/lib/referralLabels";
import { parseReferralSearchTab, referralSearchWhere } from "@/lib/referralSearch";
import { decideResolutionUnlock } from "./actions";

export default async function ReferralsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; group?: string; page?: string; stype?: string; q?: string }>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login/staff`);

  const t = await getTranslations("referrals");
  const tCommon = await getTranslations("common");

  const { status: statusFilter, group: groupFilter, page: pageStr, stype, q } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1"));
  const limit = 20;
  const searchTab = parseReferralSearchTab(stype);
  const searchQuery = (q ?? "").trim();
  const searchWhere = referralSearchWhere(searchTab, searchQuery);

  // Status filter mapped to a derived where-fragment
  const statusWhere = (value?: string) => {
    if (value === "PENDING") return { isDraft: false, students: { some: { status: "PENDING" as const } } };
    if (value === "RESOLVED") return { isDraft: false, students: { every: { status: "RESOLVED" as const }, some: {} } };
    return {};
  };

  const where = {
    ...statusWhere(statusFilter && statusFilter !== "ALL" ? statusFilter : undefined),
    ...(groupFilter ? { students: { some: { groupId: groupFilter } } } : {}),
    ...(searchWhere ? { AND: [searchWhere] } : {}),
  };

  // Pending resolution-unlock requests awaiting an admin decision
  const unlockRequests = await db.resolutionUnlockRequest.findMany({
    where: { status: "PENDING" },
    include: {
      requestedBy: { select: { name: true } },
      referralStudent: {
        include: {
          referral: { select: { number: true } },
          student: { include: { user: { select: { name: true } } } },
          group: { select: { name: true } },
          resolution: { include: { expulsionDays: { orderBy: { date: "asc" } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const [total, referrals, students, groups] = await Promise.all([
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
  ]);

  const totalPages = Math.ceil(total / limit);

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: statusFilter, group: groupFilter, stype: searchQuery ? searchTab : undefined, q: searchQuery || undefined, ...overrides };
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

      {/* Pending resolution-unlock requests */}
      {unlockRequests.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-800">
              Εκκρεμή αιτήματα ξεκλειδώματος ({unlockRequests.length})
            </CardTitle>
            <p className="text-xs text-slate-400">
              Βοηθός διευθυντής ζήτησε το ξεκλείδωμα μιας ολοκληρωμένης απόφασης. Με την έγκριση η απόφαση διαγράφεται και η
              παραπομπή επιστρέφει σε εκκρεμότητα για νέα απόφαση· με την απόρριψη διατηρείται η αρχική.
            </p>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 space-y-0">
            {unlockRequests.map((ur) => {
              const rs = ur.referralStudent;
              return (
                <div key={ur.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        #{rs.referral.number} · {rs.student.user?.name}
                        {rs.group?.name && <span className="ml-2 text-xs font-normal text-slate-400">{rs.group.name}</span>}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Αίτημα από {ur.requestedBy.name ?? "—"} · {fmtDisplayDateTime(ur.createdAt)}
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        <span className="font-semibold">Αιτιολογία:</span> {ur.reason}
                      </p>
                      {rs.resolution && (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs max-w-md">
                          <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] mb-1">
                            Τρέχουσα απόφαση (διαγράφεται με την έγκριση)
                          </p>
                          <p className="text-slate-800 font-medium">{resolutionSummary(rs.resolution)}</p>
                          {rs.resolution.actionDetails && <p className="text-slate-500 mt-0.5">{rs.resolution.actionDetails}</p>}
                          {rs.resolution.expulsionDays.length > 0 && (
                            <p className="text-slate-500 mt-0.5">
                              {rs.resolution.expulsionDays.map((d) => fmtDisplayDate(d.date)).join(", ")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <form action={decideResolutionUnlock.bind(null, ur.id, true)}>
                        <button
                          type="submit"
                          className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                        >
                          Έγκριση ξεκλειδώματος
                        </button>
                      </form>
                      <form action={decideResolutionUnlock.bind(null, ur.id, false)}>
                        <button
                          type="submit"
                          className="h-8 px-3 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50"
                        >
                          Απόρριψη
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <form method="GET" className="flex gap-3 flex-wrap items-center">
        {groupFilter && <input type="hidden" name="group" value={groupFilter} />}
        <select
          name="stype"
          defaultValue={searchTab}
          className="h-9 px-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="number">Αρ. παραπομπής</option>
          <option value="student">Όνομα μαθητή</option>
          <option value="studentId">Αρ. μητρώου μαθητή</option>
          <option value="filer">Εκπαιδευτικός υποβολής</option>
        </select>
        <input
          name="q"
          defaultValue={searchQuery}
          placeholder={tCommon("search") + "…"}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-44"
        />
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
        {(statusFilter || groupFilter || searchQuery) && (
          <Link href="?" className="h-9 px-3 flex items-center text-sm text-slate-500 hover:text-slate-800">
            {tCommon("clear")}
          </Link>
        )}
      </form>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {groupFilter
              ? t("groupLog", { name: groups.find((g) => g.id === groupFilter)?.name ?? "Τμήμα" })
              : t("allReferrals")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Αρ.</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("dateHeader")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{tCommon("student")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("description")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("filedBy")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {referrals.map((r) => {
                return (
                  <tr key={r.id} className={`hover:bg-slate-50 align-top ${referralLeftAccentClass(r)}`}>
                    <td className="px-5 py-3.5 text-sm font-semibold text-slate-700 whitespace-nowrap">#{r.number}</td>
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                      {fmtDisplayDate(r.date)}
                    </td>
                    <td className="px-5 py-3.5 text-sm">
                      <StudentsDropdown
                        canViewInfo
                        students={r.students.map((rs) => ({
                          referralStudentId: rs.id,
                          studentId: rs.studentId,
                          name: rs.student.user?.name ?? "—",
                          group: rs.group?.name ?? null,
                          status: rs.status,
                          actionLabel:
                            rs.status === "RESOLVED" && rs.resolution
                              ? actionLabel(rs.resolution.action)
                              : null,
                          actionDetails: rs.resolution?.actionDetails ?? null,
                          referralId: r.id,
                        }))}
                      />
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 max-w-xs text-sm">
                      <ReferralInfo referral={r} />
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-sm">{staffDisplayName(r.filer)}</td>
                    <td className="px-5 py-3.5">
                      <ReferralStatusBadge referral={r} />
                      <ReferralGroupSignals referral={r} className="mt-1.5" />
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
