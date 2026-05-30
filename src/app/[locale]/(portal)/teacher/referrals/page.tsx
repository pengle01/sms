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
  PARTIAL: "bg-sky-50 text-sky-700 border-sky-200",
  RESOLVED: "bg-green-50 text-green-700 border-green-200",
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Πρόχειρο",
  PENDING: "Εκκρεμής",
  PARTIAL: "Μερικώς επιλυμένη",
  RESOLVED: "Επιλυμένη",
};
const ACTION_LABEL: Record<string, string> = {
  DETENTION: "Αποβολή",
  PEDAGOGICAL_DIALOGUE: "Παιδαγωγικός Διάλογος",
  WRITTEN_AGREEMENT: "Γραπτή Συμφωνία",
  WARNING: "Προειδοποίηση",
  OTHER: "Άλλο",
};
const STUDENT_STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  RESOLVED: "bg-green-50 text-green-700 border-green-200",
};

// Include shape — same as in router
const referralInclude = {
  filer: { include: { user: { select: { name: true } } } },
  students: {
    include: {
      student: { include: { user: { select: { name: true } } } },
      group: { select: { name: true } },
      resolution: true,
    },
    orderBy: { student: { user: { name: "asc" as const } } },
  },
} as const;

type ReferralWithStudents = {
  isDraft: boolean;
  students: { status: string }[];
};

// Overall status is derived from per-student state — no Referral.status field.
function overallStatus(r: ReferralWithStudents): "DRAFT" | "PENDING" | "PARTIAL" | "RESOLVED" {
  if (r.isDraft) return "DRAFT";
  if (r.students.length === 0) return "PENDING";
  const resolved = r.students.filter((s) => s.status === "RESOLVED").length;
  if (resolved === 0) return "PENDING";
  if (resolved === r.students.length) return "RESOLVED";
  return "PARTIAL";
}

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
  const headGroupIds = staff.homeroomHeadGroups.map((g) => g.id);

  // Translate a status filter value into a Prisma where-fragment (derived state)
  const statusWhere = (value?: string) => {
    if (value === "PENDING") return { isDraft: false, students: { some: { status: "PENDING" as const } } };
    if (value === "RESOLVED") return { isDraft: false, students: { every: { status: "RESOLVED" as const }, some: {} } };
    if (value === "DRAFT") return { isDraft: true };
    return {};
  };

  // My filed referrals (all roles, all states incl. drafts)
  const myWhere = { filerId: staff.id, ...statusWhere(statusFilter) };
  const [myTotal, myReferrals] = await Promise.all([
    db.referral.count({ where: myWhere }),
    db.referral.findMany({
      where: myWhere,
      include: referralInclude,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);

  // Homegroup referrals with a pending student in my group (HEADTEACHER_B only)
  const groupReferrals =
    isHeadteacherB && headGroupIds.length > 0
      ? await db.referral.findMany({
          where: {
            isDraft: false,
            students: { some: { groupId: { in: headGroupIds }, status: "PENDING" } },
            NOT: { filerId: staff.id },
          },
          include: referralInclude,
          orderBy: { createdAt: "asc" },
        })
      : [];

  // Management: all submitted referrals with filters
  const allWhere = {
    isDraft: false,
    ...statusWhere(statusFilter && statusFilter !== "ALL" ? statusFilter : undefined),
    ...(groupFilter ? { students: { some: { groupId: groupFilter } } } : {}),
  };
  const groups = isManagement
    ? await db.group.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  const [allTotal, allReferrals] = isManagement
    ? await Promise.all([
        db.referral.count({ where: allWhere }),
        db.referral.findMany({
          where: allWhere,
          include: referralInclude,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: (page - 1) * limit,
        }),
      ])
    : [0, []];

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: statusFilter, group: groupFilter, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "ALL") p.set(k, v);
    const qs = p.toString();
    return qs ? `?${qs}` : "?";
  };

  type Referral = (typeof myReferrals)[number];

  // Render one referral as a table row — students shown inline
  const ReferralRow = ({
    r,
    showFiler,
    resolverGroupIds,
  }: {
    r: Referral;
    showFiler: boolean;
    resolverGroupIds?: string[]; // if set, only show/resolve students from these groups
  }) => {
    const status = overallStatus(r);
    const students = resolverGroupIds
      ? r.students.filter((rs) => rs.groupId && resolverGroupIds.includes(rs.groupId))
      : r.students;

    const pendingNames = students
      .filter((rs) => rs.status === "PENDING")
      .map((rs) => rs.student.user?.name ?? "")
      .filter(Boolean);

    const canResolve =
      resolverGroupIds !== undefined
        ? students.some((rs) => rs.status === "PENDING")
        : isManagement && students.some((rs) => rs.status === "PENDING");

    return (
      <tr className="hover:bg-slate-50 align-top">
        <td className="px-4 py-3 text-slate-500 text-sm whitespace-nowrap">{fmtDisplayDate(r.date)}</td>
        {showFiler && (
          <td className="px-4 py-3 text-sm text-slate-600">{r.filer.user?.name ?? "—"}</td>
        )}
        <td className="px-4 py-3 text-sm text-slate-700 max-w-xs">
          <p className="line-clamp-2">{r.description}</p>
          {r.location && <p className="text-xs text-slate-400 mt-0.5">{r.location}</p>}
        </td>
        {/* Students column with per-student status */}
        <td className="px-4 py-3 text-sm min-w-[160px]">
          <div className="space-y-1">
            {students.map((rs) => (
              <div key={rs.id} className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-800 font-medium">{rs.student.user?.name}</span>
                <span className="text-xs text-slate-400">{rs.group?.name}</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 h-4 ${STUDENT_STATUS_BADGE[rs.status] ?? ""}`}
                >
                  {rs.status === "RESOLVED" && rs.resolution
                    ? ACTION_LABEL[rs.resolution.action] ?? rs.resolution.action
                    : "Εκκρεμής"}
                </Badge>
              </div>
            ))}
            {r.students.length > students.length && (
              <p className="text-xs text-slate-400">
                +{r.students.length - students.length} άλλο
                {r.students.length - students.length !== 1 ? "ι" : "ς"}
              </p>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm">
          <Badge variant="outline" className={`text-xs ${STATUS_BADGE[status] ?? ""}`}>
            {STATUS_LABEL[status] ?? status}
          </Badge>
        </td>
        <td className="px-4 py-3 text-sm">
          {status === "DRAFT" && r.filerId === staff.id && (
            <DeleteDraftButton referralId={r.id} />
          )}
          {canResolve && (
            <ResolveReferralDialog
              referralId={r.id}
              studentNames={pendingNames}
              recommendation={r.recommendation}
              canViewCounselorNotes={showCounselorNotes}
            />
          )}
          {status === "RESOLVED" && !canResolve && (
            <span className="text-xs text-slate-400">
              {students[0]?.resolution
                ? ACTION_LABEL[students[0].resolution.action] ?? students[0].resolution.action
                : "Επιλύθηκε"}
            </span>
          )}
        </td>
      </tr>
    );
  };

  const TableHead = ({ showFiler }: { showFiler: boolean }) => (
    <thead>
      <tr className="border-b border-slate-100">
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ημερομηνία</th>
        {showFiler && <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Καταγγέλλων</th>}
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Λεπτομέρειες</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Μαθητές</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Κατάσταση</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ενέργειες</th>
      </tr>
    </thead>
  );

  const Pagination = ({ total, label }: { total: number; label: string }) => {
    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) return null;
    return (
      <div className="flex justify-between items-center px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
        <span>{label} — σελίδα {page} από {totalPages}</span>
        <div className="flex gap-2">
          {page > 1 && <Link href={buildHref({ page: String(page - 1) })} className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50">Προηγούμενη</Link>}
          {page < totalPages && <Link href={buildHref({ page: String(page + 1) })} className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50">Επόμενη</Link>}
        </div>
      </div>
    );
  };

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

      {/* Management: all referrals */}
      {isManagement && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base">Όλες οι Καταγγελίες ({allTotal})</CardTitle>
              <form method="GET" className="flex gap-2 flex-wrap">
                <select name="status" defaultValue={statusFilter ?? "ALL"}
                  className="h-8 px-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                  <option value="ALL">Όλες</option>
                  <option value="PENDING">Εκκρεμείς</option>
                  <option value="RESOLVED">Επιλυμένες</option>
                </select>
                <select name="group" defaultValue={groupFilter ?? ""}
                  className="h-8 px-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                  <option value="">Όλα τα τμήματα</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button type="submit" className="h-8 px-3 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-700">Φίλτρο</button>
                {(statusFilter || groupFilter) && <Link href="?" className="h-8 px-2 flex items-center text-xs text-slate-400 hover:text-slate-700">Καθαρισμός</Link>}
              </form>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <TableHead showFiler={true} />
              <tbody className="divide-y divide-slate-50">
                {allReferrals.map((r) => (
                  <ReferralRow key={r.id} r={r} showFiler={true} />
                ))}
                {allReferrals.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Δεν βρέθηκαν καταγγελίες
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
          <Pagination total={allTotal} label="Καταγγελίες" />
        </Card>
      )}

      {/* HEADTEACHER_B: pending referrals — card layout for accessibility */}
      {isHeadteacherB && groupReferrals.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-slate-700">
            Εκκρεμή τμήματός μου ({groupReferrals.length})
          </h3>
          {groupReferrals.map((r) => {
            const myStudents = r.students.filter(
              (rs) => rs.groupId && headGroupIds.includes(rs.groupId)
            );
            return (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                {/* Card header */}
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        {r.filer.user?.name ?? "—"} · {fmtDisplayDate(r.date)}
                        {r.location && ` · ${r.location}`}
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-xs ${STATUS_BADGE[overallStatus(r)] ?? ""}`}>
                      {STATUS_LABEL[overallStatus(r)]}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-800 leading-relaxed">{r.description}</p>
                  {r.recommendation && r.recommendation !== "NO_RECOMMENDATION" && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                      <span className="font-semibold">Εισήγηση:</span>
                      {r.recommendation.replace(/_/g, " ")}
                    </div>
                  )}
                </div>

                {/* Per-student resolve buttons */}
                <div className="divide-y divide-slate-100">
                  {myStudents.map((rs) =>
                    rs.status === "RESOLVED" ? (
                      <div key={rs.id} className="flex items-center justify-between px-5 py-4 bg-green-50/40">
                        <div>
                          <p className="text-sm font-semibold text-slate-600">{rs.student.user?.name}</p>
                          <p className="text-xs text-slate-400">{rs.group?.name}</p>
                        </div>
                        <span className="text-xs font-medium text-green-700 bg-green-100 border border-green-200 px-2.5 py-1 rounded-lg">
                          {rs.resolution ? ACTION_LABEL[rs.resolution.action] ?? rs.resolution.action : "Επιλύθηκε"}
                        </span>
                      </div>
                    ) : (
                      <div key={rs.id} className="px-5 py-3">
                        <ResolveReferralDialog
                          referralId={r.id}
                          referralStudentId={rs.id}
                          studentNames={[rs.student.user?.name ?? ""]}
                          recommendation={r.recommendation}
                          canViewCounselorNotes={showCounselorNotes}
                        />
                        <p className="text-xs text-slate-400 mt-1 pl-1">{rs.group?.name}</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
                <ReferralRow key={r.id} r={r} showFiler={false} />
              ))}
              {myReferrals.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Δεν έχετε υποβάλει καταγγελίες
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
        <Pagination total={myTotal} label="Δελτία" />
      </Card>
    </div>
  );
}
