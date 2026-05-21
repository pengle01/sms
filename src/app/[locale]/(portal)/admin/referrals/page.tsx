import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { NewReferralDialog } from "./NewReferralDialog";
import { ResolveReferralDialog } from "./ResolveReferralDialog";
import { canViewAllReferrals } from "@/lib/rbac";
import type { Role } from "@/generated/prisma";

export default async function ReferralsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const { status: statusFilter, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1"));
  const limit = 20;

  const role = session.user.role as Role;
  const canViewAll = canViewAllReferrals(role);

  // If teacher, find their staff profile to filter
  let staffId: string | undefined;
  if (role === "TEACHER") {
    const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
    staffId = staff?.id;
  }

  const where = {
    ...(statusFilter && statusFilter !== "ALL" ? { status: statusFilter as "PENDING" | "ASSIGNED" | "RESOLVED" } : {}),
    ...(staffId ? { filerId: staffId } : {}),
  };

  const [total, referrals, students] = await Promise.all([
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
  ]);

  const totalPages = Math.ceil(total / limit);

  const statusBadge = (status: string) => {
    if (status === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
    if (status === "RESOLVED") return "bg-green-50 text-green-700 border-green-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Referrals</h2>
          <p className="text-slate-500 text-sm mt-1">{total} total</p>
        </div>
        <NewReferralDialog students={students} locale={locale} />
      </div>

      {/* Filters */}
      <form method="GET" className="flex gap-3 flex-wrap">
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
        <button
          type="submit"
          className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          Filter
        </button>
      </form>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Referral Log</CardTitle>
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
                {canViewAll && (
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {referrals.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                    {new Date(r.date).toLocaleDateString("el-GR")}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-slate-900">{r.student.user.name}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant="outline" className="text-xs">{r.group?.name ?? r.student.group?.name ?? "—"}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 max-w-xs">
                    <span className="line-clamp-2">{r.description}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{r.filer.user.name}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant="outline" className={`text-xs ${statusBadge(r.status)}`}>
                      {r.status}
                    </Badge>
                  </td>
                  {canViewAll && (
                    <td className="px-5 py-3.5">
                      {r.status === "PENDING" && (
                        <ResolveReferralDialog referralId={r.id} studentName={r.student.user.name ?? ""} />
                      )}
                      {r.status === "RESOLVED" && r.resolution && (
                        <span className="text-xs text-slate-400">{r.resolution.action.replace(/_/g, " ")}</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {referrals.length === 0 && (
                <tr>
                  <td colSpan={canViewAll ? 7 : 6} className="px-5 py-16 text-center text-slate-400">
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
              <a href={`?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                Previous
              </a>
            )}
            {page < totalPages && (
              <a href={`?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
