import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Plus } from "lucide-react";
import { fmtDisplayDate } from "@/lib/dates";
import { canViewCounselorNotes } from "@/lib/rbac";
import { ResolveReferralDialog } from "./ResolveReferralDialog";
import { DeleteDraftButton } from "./DeleteDraftButton";
import type { Role } from "@/generated/prisma";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-500 border-slate-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  ASSIGNED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RESOLVED: "bg-green-50 text-green-700 border-green-200",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Πρόχειρο",
  PENDING: "Εκκρεμής",
  ASSIGNED: "Ανατεθείσα",
  RESOLVED: "Επιλυμένη",
};

const ACTION_LABEL: Record<string, string> = {
  DETENTION: "Αποβολή",
  PEDAGOGICAL_DIALOGUE: "Παιδαγωγικός Διάλογος",
  WRITTEN_AGREEMENT: "Γραπτή Συμφωνία",
  WARNING: "Προειδοποίηση",
  OTHER: "Άλλο",
};

export default async function TeacherReferralsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; group?: string; page?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const role = session.user.role as Role;
  const userId = session.user.id;

  const sp = await searchParams;
  const statusFilter = sp.status;
  const groupFilter = sp.group;
  const page = Math.max(1, parseInt(sp.page ?? "1"));
  const limit = 25;

  const staff = await db.staffProfile.findUnique({
    where: { userId },
    include: { homeroomHeadGroups: { select: { id: true, name: true } } },
  });
  if (!staff) redirect(`/${locale}/teacher/dashboard`);

  const isManagement = ["HEADMASTER", "HEADTEACHER_A"].includes(role);
  const isHeadteacherB = role === "HEADTEACHER_B";
  const showCounselorNotes = canViewCounselorNotes(role);

  // My filed referrals (all roles)
  const myWhere = {
    filerId: staff.id,
    ...(statusFilter ? { status: statusFilter as "DRAFT" | "PENDING" | "ASSIGNED" | "RESOLVED" } : {}),
  };
  const [myTotal, myReferrals] = await Promise.all([
    db.referral.count({ where: myWhere }),
    db.referral.findMany({
      where: myWhere,
      include: {
        student: { include: { user: { select: { name: true } } } },
        group: { select: { name: true } },
        resolution: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);

  // Homegroup pending referrals (HEADTEACHER_B only)
  const headGroupIds = staff.homeroomHeadGroups.map((g) => g.id);
  const [groupReferrals, groups] = await Promise.all([
    isHeadteacherB && headGroupIds.length > 0
      ? db.referral.findMany({
          where: {
            groupId: { in: headGroupIds },
            status: "PENDING",
          },
          include: {
            student: { include: { user: { select: { name: true } } } },
            filer: { include: { user: { select: { name: true } } } },
            group: { select: { name: true } },
            resolution: true,
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    isManagement
      ? db.group.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  // Management: all referrals with filters
  const allWhere = {
    ...(statusFilter && statusFilter !== "ALL" ? { status: statusFilter as "DRAFT" | "PENDING" | "ASSIGNED" | "RESOLVED" } : { status: { not: "DRAFT" as const } }),
    ...(groupFilter ? { groupId: groupFilter } : {}),
  };
  const [allTotal, allReferrals] = isManagement
    ? await Promise.all([
        db.referral.count({ where: allWhere }),
        db.referral.findMany({
          where: allWhere,
          include: {
            student: { include: { user: { select: { name: true } } } },
            filer: { include: { user: { select: { name: true } } } },
            group: { select: { name: true } },
            resolution: true,
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: (page - 1) * limit,
        }),
      ])
    : [0, []];

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: statusFilter, group: groupFilter, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "ALL") p.set(k, v);
    }
    const qs = p.toString();
    return qs ? `?${qs}` : "?";
  };

  const ReferralRow = ({
    r,
    showFiler,
    canResolve,
  }: {
    r: (typeof myReferrals)[number] & { filer?: { user: { name: string | null } | null } };
    showFiler: boolean;
    canResolve: boolean;
  }) => (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 text-slate-500 text-sm whitespace-nowrap">
        {fmtDisplayDate(r.date)}
      </td>
      <td className="px-4 py-3 font-medium text-slate-900 text-sm">
        {r.student.user?.name ?? "—"}
      </td>
      <td className="px-4 py-3 text-sm">
        <Badge variant="outline" className="text-xs">{r.group?.name ?? "—"}</Badge>
      </td>
      {showFiler && (
        <td className="px-4 py-3 text-sm text-slate-500">{r.filer?.user?.name ?? "—"}</td>
      )}
      <td className="px-4 py-3 max-w-xs text-sm text-slate-600">
        <span className="line-clamp-2">{r.description}</span>
      </td>
      <td className="px-4 py-3 text-sm">
        <Badge variant="outline" className={`text-xs ${STATUS_BADGE[r.status] ?? ""}`}>
          {STATUS_LABEL[r.status] ?? r.status}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm">
        {r.status === "DRAFT" && (
          <div className="flex items-center gap-2">
            <Link
              href={`/${locale}/teacher/referrals/new`}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium"
            >
              Επεξεργασία
            </Link>
            <DeleteDraftButton referralId={r.id} />
          </div>
        )}
        {r.status === "PENDING" && canResolve && (
          <ResolveReferralDialog
            referralId={r.id}
            studentName={r.student.user?.name ?? ""}
            recommendation={r.recommendation}
            canViewCounselorNotes={showCounselorNotes}
          />
        )}
        {r.status === "RESOLVED" && r.resolution && (
          <span className="text-xs text-slate-400">
            {ACTION_LABEL[r.resolution.action] ?? r.resolution.action}
          </span>
        )}
      </td>
    </tr>
  );

  const TableHead = ({ showFiler }: { showFiler: boolean }) => (
    <thead>
      <tr className="border-b border-slate-100">
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ημερομηνία</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Μαθητής</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Τμήμα</th>
        {showFiler && <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Καταγγέλλων</th>}
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Λεπτομέρειες</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Κατάσταση</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ενέργειες</th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-slate-900">Καταγγελίες</h2>
        <Link
          href={`/${locale}/teacher/referrals/new`}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          Νέα Καταγγελία
        </Link>
      </div>

      {/* Management view: all referrals with filters */}
      {isManagement && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base">Όλες οι Καταγγελίες ({allTotal})</CardTitle>
              <form method="GET" className="flex gap-2 flex-wrap">
                <select
                  name="status"
                  defaultValue={statusFilter ?? "ALL"}
                  className="h-8 px-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="ALL">Όλες</option>
                  <option value="PENDING">Εκκρεμείς</option>
                  <option value="RESOLVED">Επιλυμένες</option>
                </select>
                <select
                  name="group"
                  defaultValue={groupFilter ?? ""}
                  className="h-8 px-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="">Όλα τα τμήματα</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="h-8 px-3 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-700"
                >
                  Φίλτρο
                </button>
                {(statusFilter || groupFilter) && (
                  <Link href="?" className="h-8 px-2 flex items-center text-xs text-slate-400 hover:text-slate-700">
                    Καθαρισμός
                  </Link>
                )}
              </form>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <TableHead showFiler={true} />
              <tbody className="divide-y divide-slate-50">
                {allReferrals.map((r) => (
                  <ReferralRow
                    key={r.id}
                    r={r as (typeof myReferrals)[number] & { filer?: { user: { name: string | null } | null } }}
                    showFiler={true}
                    canResolve={true}
                  />
                ))}
                {allReferrals.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Δεν βρέθηκαν καταγγελίες
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
          {Math.ceil(allTotal / limit) > 1 && (
            <div className="flex justify-between items-center px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
              <span>Σελίδα {page} από {Math.ceil(allTotal / limit)}</span>
              <div className="flex gap-2">
                {page > 1 && <Link href={buildHref({ page: String(page - 1) })} className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50">Προηγούμενη</Link>}
                {page < Math.ceil(allTotal / limit) && <Link href={buildHref({ page: String(page + 1) })} className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50">Επόμενη</Link>}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* HEADTEACHER_B: their homegroup's pending referrals */}
      {isHeadteacherB && groupReferrals.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Εκκρεμή τμήματός μου ({groupReferrals.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <TableHead showFiler={true} />
              <tbody className="divide-y divide-slate-50">
                {groupReferrals.map((r) => (
                  <ReferralRow
                    key={r.id}
                    r={r as (typeof myReferrals)[number] & { filer?: { user: { name: string | null } | null } }}
                    showFiler={true}
                    canResolve={true}
                  />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* My filed referrals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Δελτία που υπέβαλα ({myTotal})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <TableHead showFiler={false} />
            <tbody className="divide-y divide-slate-50">
              {myReferrals.map((r) => (
                <ReferralRow
                  key={r.id}
                  r={r}
                  showFiler={false}
                  canResolve={false}
                />
              ))}
              {myReferrals.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Δεν έχετε υποβάλει καταγγελίες
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
        {Math.ceil(myTotal / limit) > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>Σελίδα {page} από {Math.ceil(myTotal / limit)}</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={buildHref({ page: String(page - 1) })} className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50">Προηγούμενη</Link>}
              {page < Math.ceil(myTotal / limit) && <Link href={buildHref({ page: String(page + 1) })} className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50">Επόμενη</Link>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
