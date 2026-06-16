import { db } from "@/server/db";
import { staffDisplayName } from "@/lib/staffName";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Plus, Printer } from "lucide-react";
import { fmtDisplayDate } from "@/lib/dates";
import { canViewCounselorNotes, canViewAllReferrals } from "@/lib/rbac";
import { getPeriodsPerDay, DEFAULT_PERIODS_PER_DAY } from "@/lib/schoolConfig";
import { ResolveReferralDialog } from "./ResolveReferralDialog";
import { DeleteDraftButton } from "./DeleteDraftButton";
import { ReferralStatusBadge, ReferralGroupSignals, referralBorderClass, referralLeftAccentClass } from "@/components/referrals/ReferralStatusBadge";
import { StudentInfoDialog } from "@/components/referrals/StudentInfoDialog";
import { StudentsDropdown } from "@/components/referrals/StudentsDropdown";
import { ReferralInfo } from "@/components/referrals/ReferralInfo";
import { ReferralTabs } from "@/components/referrals/ReferralTabs";
import { overallStatus } from "@/lib/referralStatus";
import { recommendationLabel, resolutionSummary } from "@/lib/referralLabels";
import { parseReferralSearchTab, referralSearchWhere } from "@/lib/referralSearch";
import { UnlockResolutionDialog } from "./UnlockResolutionDialog";
import type { Role } from "@/generated/prisma";

// Include shape — same as in router
const referralInclude = {
  filer: { include: { user: { select: { name: true } } } },
  students: {
    include: {
      student: { include: { user: { select: { name: true } } } },
      group: { select: { name: true } },
      resolution: {
        include: {
          expulsionDays: { orderBy: { date: "asc" as const } },
          resolvedBy: { select: { name: true } },
        },
      },
      unlockRequests: { where: { status: "PENDING" as const }, select: { id: true } },
    },
    orderBy: { student: { user: { name: "asc" as const } } },
  },
} as const;

export default async function TeacherReferralsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; group?: string; page?: string; stype?: string; q?: string }>;
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
  // Search by referral no. / student name / student ID / filing teacher
  const searchTab = parseReferralSearchTab(sp.stype);
  const searchQuery = (sp.q ?? "").trim();
  const searchWhere = referralSearchWhere(searchTab, searchQuery);

  const staff = await db.staffProfile.findUnique({
    where: { userId },
    include: { homeroomHeadGroups: { select: { id: true, name: true } } },
  });
  if (!staff) redirect(`/${locale}/teacher/dashboard`);

  const isManagement = ["HEADMASTER", "HEADTEACHER_A"].includes(role);
  const isHeadteacherB = role === "HEADTEACHER_B";
  const showCounselorNotes = canViewCounselorNotes(role);
  const canViewStudentInfo = canViewAllReferrals(role);
  const headGroupIds = staff.homeroomHeadGroups.map((g) => g.id);

  const periodsConfig = { ...DEFAULT_PERIODS_PER_DAY, ...(await getPeriodsPerDay()) };

  // Translate a status filter value into a Prisma where-fragment (derived state)
  const statusWhere = (value?: string) => {
    if (value === "PENDING") return { isDraft: false, students: { some: { status: "PENDING" as const } } };
    if (value === "RESOLVED") return { isDraft: false, students: { every: { status: "RESOLVED" as const }, some: {} } };
    if (value === "DRAFT") return { isDraft: true };
    return {};
  };

  // Search applies to every list seen by headteachers/management.
  const canSearch = isManagement || isHeadteacherB;
  const searchAnd = canSearch && searchWhere ? { AND: [searchWhere] } : {};

  // My filed referrals (all roles, all states incl. drafts)
  const myWhere = { filerId: staff.id, ...statusWhere(statusFilter), ...searchAnd };
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
            // NOTE: do NOT exclude referrals this headteacher filed — a headteacher
            // can file against a student in their own homegroup, and that referral
            // must still surface here so they can resolve it (the "my filed" tab
            // has no resolve action). It may appear in both tabs; that's expected.
            ...searchAnd,
          },
          include: referralInclude,
          orderBy: { createdAt: "asc" },
        })
      : [];

  // History: homegroup referrals where my group's students are all resolved (HEADTEACHER_B only)
  const groupHistory =
    isHeadteacherB && headGroupIds.length > 0
      ? await db.referral.findMany({
          where: {
            isDraft: false,
            students: { some: { groupId: { in: headGroupIds }, status: "RESOLVED" } },
            // Resolved-only: exclude referrals still pending in my group. Self-filed
            // referrals are intentionally NOT excluded (see groupReferrals above).
            NOT: { students: { some: { groupId: { in: headGroupIds }, status: "PENDING" } } },
            ...searchAnd,
          },
          include: referralInclude,
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : [];

  // Management: all submitted referrals with filters
  const allWhere = {
    isDraft: false,
    ...searchAnd,
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
    const merged = { status: statusFilter, group: groupFilter, stype: searchQuery ? searchTab : undefined, q: searchQuery || undefined, ...overrides };
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

    // Only the corresponding homegroup headteacher resolves (via the examine
    // tab, where resolverGroupIds is set) — management only views.
    const canResolve =
      resolverGroupIds !== undefined && students.some((rs) => rs.status === "PENDING");

    return (
      <tr className={`hover:bg-slate-50 align-top ${referralLeftAccentClass(r)}`}>
        <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">#{r.number}</td>
        <td className="px-4 py-3 text-slate-500 text-sm whitespace-nowrap">{fmtDisplayDate(r.date)}</td>
        {showFiler && (
          <td className="px-4 py-3 text-sm text-slate-600">{staffDisplayName(r.filer)}</td>
        )}
        <td className="px-4 py-3 text-sm text-slate-700 max-w-xs">
          <ReferralInfo referral={r} />
        </td>
        {/* Students column — single inline, multiple in a dropdown */}
        <td className="px-4 py-3 text-sm min-w-[160px]">
          <StudentsDropdown
            canViewInfo={canViewStudentInfo}
            students={students.map((rs) => ({
              referralStudentId: rs.id,
              studentId: rs.studentId,
              name: rs.student.user?.name ?? "—",
              group: rs.group?.name ?? null,
              status: rs.status,
              actionLabel:
                rs.status === "RESOLVED" && rs.resolution
                  ? resolutionSummary(rs.resolution)
                  : null,
              actionDetails: rs.resolution?.actionDetails ?? null,
              referralId: r.id,
            }))}
          />
        </td>
        <td className="px-4 py-3 text-sm">
          <ReferralStatusBadge referral={r} />
          <ReferralGroupSignals referral={r} className="mt-1.5" />
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
              locale={locale}
              periodsConfig={periodsConfig}
            />
          )}
          {status === "RESOLVED" && !canResolve && (
            <span className="text-xs text-slate-400">
              {students[0]?.resolution ? resolutionSummary(students[0].resolution) : "Επιλύθηκε"}
            </span>
          )}
          {/* Ask to unlock resolutions this user made (admin approval needed) */}
          {students
            .filter((rs) => rs.resolution && rs.resolution.resolvedById === userId)
            .map((rs) => (
              <div key={rs.id} className="mt-1.5">
                <UnlockResolutionDialog
                  resolutionId={rs.resolution!.id}
                  studentName={rs.student.user?.name ?? "—"}
                  currentSummary={resolutionSummary(rs.resolution!)}
                  hasPendingUnlock={rs.unlockRequests.length > 0}
                />
              </div>
            ))}
        </td>
      </tr>
    );
  };

  const TableHead = ({ showFiler }: { showFiler: boolean }) => (
    <thead>
      <tr className="border-b border-slate-100">
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Αρ.</th>
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

  // HEADTEACHER_B examine card — full coloured border, per-student info + resolve.
  const GroupCard = ({ r }: { r: Referral }) => {
    const myStudents = r.students.filter((rs) => rs.groupId && headGroupIds.includes(rs.groupId));
    const pendingMine = myStudents.filter((rs) => rs.status === "PENDING");
    const resolvedMine = myStudents.filter((rs) => rs.status === "RESOLVED");
    return (
      <div className={`rounded-2xl border-2 ${referralBorderClass(r, headGroupIds)} bg-white overflow-hidden shadow-sm`}>
        {/* Card header */}
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <span className="text-slate-700">#{r.number}</span> · {staffDisplayName(r.filer)} · {fmtDisplayDate(r.date)}
              {r.location && ` · ${r.location}`}
            </p>
            <div className="flex items-center gap-2">
              {resolvedMine.length > 0 && (
                <a
                  href={`/${locale}/teacher/referrals/${r.id}/print`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Εκτύπωση
                </a>
              )}
              {/* Badge reflects only this headteacher's own students */}
              <ReferralStatusBadge referral={r} scopeGroupIds={headGroupIds} />
            </div>
          </div>
          {/* When other homegroups are involved, show each headteacher's progress */}
          <ReferralGroupSignals referral={r} className="mt-2" />
          <p className="mt-2 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{r.description}</p>
          {/* Full incident details — visible to everyone who can see the referral */}
          {(r.incidentTime || r.extraInfo) && (
            <div className="mt-2 space-y-0.5 text-xs text-slate-500">
              {r.incidentTime && (
                <p><span className="font-semibold text-slate-600">Ώρα συμβάντος:</span> {r.incidentTime}</p>
              )}
              {r.extraInfo && (
                <p className="whitespace-pre-wrap"><span className="font-semibold text-slate-600">Επιπλέον πληροφορίες:</span> {r.extraInfo}</p>
              )}
            </div>
          )}
          {r.recommendation && r.recommendation !== "NO_RECOMMENDATION" && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <span className="font-semibold">Εισήγηση:</span>
              {recommendationLabel(r.recommendation)}
            </div>
          )}
        </div>

        {/* Student resolution buttons */}
        <div className="divide-y divide-slate-100">
          {pendingMine.length >= 2 && (
            <div className="px-5 py-3 bg-slate-50">
              <ResolveReferralDialog
                referralId={r.id}
                studentNames={pendingMine.map((rs) => rs.student.user?.name ?? "").filter(Boolean)}
                recommendation={r.recommendation}
                canViewCounselorNotes={showCounselorNotes}
                groupResolve
                locale={locale}
                periodsConfig={periodsConfig}
              />
              <p className="text-xs text-slate-400 mt-1 pl-1">Κοινή ποινή για όλους</p>
            </div>
          )}

          {myStudents.map((rs) =>
            rs.status === "RESOLVED" ? (
              <div key={rs.id} className="px-5 py-4 bg-green-50/40">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-600">{rs.student.user?.name}</p>
                    <p className="text-xs text-slate-400">{rs.group?.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StudentInfoDialog
                      studentId={rs.studentId}
                      excludeReferralId={r.id}
                      studentName={rs.student.user?.name ?? undefined}
                    />
                    <span className="text-xs font-medium text-green-700 bg-green-100 border border-green-200 px-2.5 py-1 rounded-lg">
                      {rs.resolution ? resolutionSummary(rs.resolution) : "Επιλύθηκε"}
                    </span>
                    {rs.resolution && rs.resolution.resolvedById === userId && (
                      <UnlockResolutionDialog
                        resolutionId={rs.resolution.id}
                        studentName={rs.student.user?.name ?? "—"}
                        currentSummary={resolutionSummary(rs.resolution)}
                        hasPendingUnlock={rs.unlockRequests.length > 0}
                      />
                    )}
                  </div>
                </div>
                {/* Punishment details — what exactly was imposed, by whom */}
                {rs.resolution && (
                  <div className="mt-2 text-xs text-slate-500 space-y-0.5">
                    {rs.resolution.actionDetails && <p>{rs.resolution.actionDetails}</p>}
                    {rs.resolution.expulsionDays.length > 0 && (
                      <p>
                        Ημέρες: {rs.resolution.expulsionDays.map((d) => fmtDisplayDate(d.date)).join(", ")}
                      </p>
                    )}
                    <p className="text-slate-400">
                      {rs.resolution.resolvedBy?.name ?? "—"} · {fmtDisplayDate(rs.resolution.resolvedAt)}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div key={rs.id} className="px-5 py-3">
                <ResolveReferralDialog
                  referralId={r.id}
                  referralStudentId={rs.id}
                  studentNames={[rs.student.user?.name ?? ""]}
                  recommendation={r.recommendation}
                  canViewCounselorNotes={showCounselorNotes}
                  locale={locale}
                  periodsConfig={periodsConfig}
                />
                <div className="flex items-center justify-between gap-2 mt-1 pl-1">
                  <p className="text-xs text-slate-400">{rs.group?.name}</p>
                  <StudentInfoDialog
                    studentId={rs.studentId}
                    excludeReferralId={r.id}
                    studentName={rs.student.user?.name ?? undefined}
                  />
                </div>
              </div>
            )
          )}
        </div>
      </div>
    );
  };

  const examineContent = (
    <div className="space-y-3">
      {groupReferrals.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-400">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Δεν υπάρχουν καταγγελίες προς εξέταση
        </div>
      ) : (
        groupReferrals.map((r) => <GroupCard key={r.id} r={r} />)
      )}
    </div>
  );

  const historyContent = (
    <div className="space-y-3">
      {groupHistory.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-400">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Δεν υπάρχουν επιλυμένες καταγγελίες
        </div>
      ) : (
        groupHistory.map((r) => <GroupCard key={r.id} r={r} />)
      )}
    </div>
  );

  const myFiledCard = (
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
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Δεν έχετε υποβάλει καταγγελίες
              </td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
      <Pagination total={myTotal} label="Δελτία" />
    </Card>
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

      {/* Search — referral no. / student name / student ID / filing teacher */}
      {canSearch && (
        <form method="GET" className="flex gap-2 flex-wrap items-center">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {groupFilter && <input type="hidden" name="group" value={groupFilter} />}
          <select
            name="stype"
            defaultValue={searchTab}
            className="h-9 px-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="number">Αρ. Καταγγελίας</option>
            <option value="student">Όνομα Μαθητή</option>
            <option value="studentId">Αρ. Μητρώου</option>
            <option value="filer">Εκπαιδευτικός</option>
          </select>
          <input
            name="q"
            defaultValue={searchQuery}
            placeholder="Αναζήτηση…"
            className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-48"
          />
          <button type="submit" className="h-9 px-4 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700">
            Αναζήτηση
          </button>
          {searchQuery && (
            <Link href={buildHref({ q: undefined, stype: undefined, page: undefined })} className="h-9 px-2 flex items-center text-sm text-slate-400 hover:text-slate-700">
              Καθαρισμός
            </Link>
          )}
        </form>
      )}

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
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">
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

      {/* HEADTEACHER_B: examine tab first, own filed second */}
      {isHeadteacherB ? (
        <ReferralTabs
          tabs={[
            {
              key: "examine",
              label: "Προς εξέταση",
              count: groupReferrals.length,
              highlight: true,
              content: examineContent,
            },
            {
              key: "history",
              label: "Ιστορικό",
              count: groupHistory.length,
              content: historyContent,
            },
            {
              key: "mine",
              label: "Δελτία που υπέβαλα",
              count: myTotal,
              content: myFiledCard,
            },
          ]}
        />
      ) : (
        myFiledCard
      )}
    </div>
  );
}
