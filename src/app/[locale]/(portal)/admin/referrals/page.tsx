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

  const { status: statusFilter, group: groupFilter, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1"));
  const limit = 20;

  const where = {
    ...(statusFilter && statusFilter !== "ALL" ? { status: statusFilter as "PENDING" | "ASSIGNED" | "RESOLVED" } : {}),
    ...(groupFilter ? { groupId: groupFilter } : {}),
  };

  const [total, referrals, students, groups, groupSummary] = await Promise.all([
    db.referral.count({ where }),
    db.referral.findMany({
      where,
      include: {
        student: { include: { user: { select: { name: true } }, group: true } },
        filer: { include: { user: { select: { name: true } } } },
        resolution: true,
        group: true,
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
        _count: { select: { referrals: true } },
        referrals: {
          where: { status: "PENDING" },
          select: { id: true },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  const statusBadge = (status: string) => {
    if (status === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
    if (status === "RESOLVED") return "bg-green-50 text-green-700 border-green-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status: statusFilter, group: groupFilter, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "ALL") params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Καταγγελίες</h2>
          <p className="text-slate-500 text-sm mt-1">{total} total</p>
        </div>
        <NewReferralDialog students={students} locale={locale} />
      </div>

      {/* Homegroup summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {groupSummary.map((g) => {
          const pending = g.referrals.length;
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
                {g._count.referrals} total
                {pending > 0 && (
                  <span className={cn("ml-1.5 font-semibold", isActive ? "text-amber-200" : "text-amber-600")}>
                    · {pending} pending
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
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <select
          name="group"
          defaultValue={groupFilter ?? ""}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">All homegroups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          Filter
        </button>
        {(statusFilter || groupFilter) && (
          <Link href="?" className="h-9 px-3 flex items-center text-sm text-slate-500 hover:text-slate-800">
            Clear
          </Link>
        )}
      </form>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {groupFilter
              ? `${groups.find((g) => g.id === groupFilter)?.name ?? "Group"} — Referral Log`
              : "All Referrals"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Group</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Filed by</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {referrals.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                    {new Date(r.date).toLocaleDateString("el-GR")}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-slate-900">{r.student.user?.name}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant="outline" className="text-xs">{r.group?.name ?? r.student.group?.name ?? "—"}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 max-w-xs">
                    <span className="line-clamp-2">{r.description}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{r.filer.user?.name}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant="outline" className={`text-xs ${statusBadge(r.status)}`}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    {r.status === "PENDING" && (
                      <ResolveReferralDialog referralId={r.id} studentName={r.student.user?.name ?? ""} />
                    )}
                    {r.status === "RESOLVED" && r.resolution && (
                      <span className="text-xs text-slate-400">{r.resolution.action.replace(/_/g, " ")}</span>
                    )}
                  </td>
                </tr>
              ))}
              {referrals.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-slate-400">
                    <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    No referrals found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
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
