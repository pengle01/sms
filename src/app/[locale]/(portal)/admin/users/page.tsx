import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { UserX } from "lucide-react";
import type { Role, Prisma } from "@/generated/prisma";
import { StaffLinkControls } from "../staff/StaffLinkControls";

const ROLE_META: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN:       { label: "Υπερδιαχειριστής",     color: "bg-purple-100 text-purple-700 border-purple-200" },
  HEADMASTER:        { label: "Διευθυντής",           color: "bg-slate-800 text-white border-slate-800" },
  HEADTEACHER_A:     { label: "Βοηθός Διευθυντής Α",  color: "bg-blue-100 text-blue-700 border-blue-200" },
  HEADTEACHER_B:     { label: "Βοηθός Διευθυντής",    color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  STUDENT_COUNSELOR: { label: "Σύμβουλος Σπουδών",    color: "bg-teal-100 text-teal-700 border-teal-200" },
  TEACHER:           { label: "Εκπαιδευτικός",        color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  SCHOOL_ADMIN:      { label: "Διοικητικός",          color: "bg-amber-100 text-amber-700 border-amber-200" },
  CHAPERONE:         { label: "Συνοδός",              color: "bg-orange-100 text-orange-700 border-orange-200" },
};

const FILTER_TABS: { key: string; label: string }[] = [
  { key: "all",              label: "Όλο το Προσωπικό" },
  { key: "HEADMASTER",       label: "Διευθυντής" },
  { key: "HEADTEACHER_A",    label: "Βοηθοί Διευθυντές Α" },
  { key: "HEADTEACHER_B",    label: "Βοηθοί Διευθυντές" },
  { key: "STUDENT_COUNSELOR",label: "Σύμβουλοι Σπουδών" },
  { key: "TEACHER",          label: "Εκπαιδευτικοί" },
  { key: "SCHOOL_ADMIN",     label: "Διοικητικοί" },
  { key: "SUPER_ADMIN",      label: "Υπερδιαχειριστές" },
  { key: "unlinked",         label: "Μη Συνδεδεμένα Προφίλ" },
];

const STAFF_ROLES: Role[] = [
  "HEADMASTER", "HEADTEACHER_A", "HEADTEACHER_B", "STUDENT_COUNSELOR",
  "TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN",
];

// Filter by "added roles" — admin-granted extra roles + designations (which sit
// on top of the primary role). Each maps to a user-level where clause.
const DESIGNATION_TABS: { key: string; label: string }[] = [
  { key: "extraAdmin", label: "+Διαχειριστής (παραχωρημένο)" },
  { key: "specialEd",  label: "Ειδική Αγωγή" },
  { key: "ddk",        label: "Συντονιστής ΔΔΚ" },
  { key: "subCoord",   label: "Συντ. Αναπληρώσεων" },
];

const DESIGNATION_WHERE: Record<string, Prisma.UserWhereInput> = {
  extraAdmin: { extraRoles: { has: "SUPER_ADMIN" } },
  specialEd:  { staffProfile: { specialEducation: true } },
  ddk:        { staffProfile: { ddkCoordinator: true } },
  subCoord:   { staffProfile: { substitutionCoordinator: true } },
};

export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const { locale } = await params;
  const { role: roleParam } = await searchParams;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login`);

  const knownTab =
    FILTER_TABS.find((t) => t.key === roleParam)?.key ??
    DESIGNATION_TABS.find((t) => t.key === roleParam)?.key;
  const activeTab = knownTab ?? "all";
  const showUnlinked = activeTab === "unlinked";
  const designationWhere = DESIGNATION_WHERE[activeTab];

  // Added-role/designation filters narrow within staff; plain role tabs match the
  // primary role; "all" lists every staff member.
  const userWhere: Prisma.UserWhereInput = designationWhere
    ? { role: { in: STAFF_ROLES }, ...designationWhere }
    : activeTab === "all"
      ? { role: { in: STAFF_ROLES } }
      : { role: { equals: activeTab as Role } };

  const [users, unlinkedProfiles, linkableUsers] = await Promise.all([
    showUnlinked
      ? Promise.resolve([])
      : db.user.findMany({
          where: userWhere,
          include: {
            staffProfile: {
              select: {
                id: true,
                scheduleName: true,
                phone: true,
                department: true,
                specialEducation: true,
                homeroomGroups: { select: { name: true } },
                homeroomHeadGroups: { select: { name: true } },
                _count: { select: { timetableSlots: true } },
              },
            },
          },
          orderBy: [{ role: "asc" }, { name: "asc" }],
        }),
    db.staffProfile.findMany({
      where: { userId: null },
      include: {
        homeroomGroups: { select: { name: true } },
        homeroomHeadGroups: { select: { name: true } },
        _count: { select: { timetableSlots: true } },
      },
    }),
    db.user.findMany({
      where: {
        role: { in: STAFF_ROLES },
        isActive: true,
        staffProfile: null,
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const tabLabel =
    FILTER_TABS.find((t) => t.key === activeTab)?.label ??
    DESIGNATION_TABS.find((t) => t.key === activeTab)?.label ??
    "Προσωπικό";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Προσωπικό</h2>
        <p className="text-slate-500 text-sm mt-1">
          {showUnlinked
            ? `${unlinkedProfiles.length} ${unlinkedProfiles.length !== 1 ? "μη συνδεδεμένα προφίλ" : "μη συνδεδεμένο προφίλ"}`
            : `${users.length} ${tabLabel.toLowerCase()}`}
          {!showUnlinked && unlinkedProfiles.length > 0 && (
            <Link href="?role=unlinked" className="ml-2 text-amber-600 font-medium hover:underline">
              · {unlinkedProfiles.length} {unlinkedProfiles.length !== 1 ? "μη συνδεδεμένα προφίλ" : "μη συνδεδεμένο προφίλ"}
            </Link>
          )}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map(({ key, label }) => (
          <Link
            key={key}
            href={key === "all" ? "?" : `?role=${key}`}
            className={cn(
              "h-9 px-4 rounded-lg text-sm font-medium border transition-colors",
              key === "unlinked"
                ? activeTab === "unlinked"
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-white text-amber-600 border-amber-200 hover:border-amber-400"
                : activeTab === key
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800"
            )}
          >
            {label}
            {key === "unlinked" && unlinkedProfiles.length > 0 && (
              <span className={cn("ml-1.5 text-xs font-semibold",
                activeTab === "unlinked" ? "text-amber-100" : "text-amber-500"
              )}>
                {unlinkedProfiles.length}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Added roles & designations */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Πρόσθετοι ρόλοι</span>
        {DESIGNATION_TABS.map(({ key, label }) => (
          <Link
            key={key}
            href={`?role=${key}`}
            className={cn(
              "h-8 px-3 rounded-lg text-xs font-medium border transition-colors",
              activeTab === key
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-white text-purple-700 border-purple-200 hover:border-purple-400",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Unlinked profiles view */}
      {showUnlinked && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
              <UserX className="w-4 h-4" />
              Μη συνδεδεμένα προφίλ — εγγραφές προγράμματος χωρίς συνδεδεμένο λογαριασμό χρήστη
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {unlinkedProfiles.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">Όλα τα προφίλ είναι συνδεδεμένα.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-amber-100">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">ID Προφίλ</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">Ώρες</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">Τμήματα</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">Σύνδεση με χρήστη</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50">
                  {unlinkedProfiles.map((sp) => {
                    const homerooms = [
                      ...sp.homeroomGroups.map((g) => g.name),
                      ...sp.homeroomHeadGroups.map((g) => `${g.name} (B')`),
                    ];
                    return (
                      <tr key={sp.id} className="hover:bg-amber-50/60">
                        <td className="px-5 py-3 font-mono text-xs text-slate-600">{sp.scheduleName ?? sp.id}</td>
                        <td className="px-4 py-3 text-slate-500">{sp._count.timetableSlots}</td>
                        <td className="px-4 py-3">
                          {homerooms.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {homerooms.map((n) => (
                                <Badge key={n} variant="outline" className="text-xs">{n}</Badge>
                              ))}
                            </div>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <StaffLinkControls
                            staffProfileId={sp.id}
                            linkedUserId={null}
                            linkedUserName={null}
                            availableUsers={linkableUsers}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Staff user table */}
      {!showUnlinked && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Όνομα</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Ρόλος</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Τηλέφωνο</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Ώρες</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Τμήματα</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Προφίλ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-slate-400">Δεν βρέθηκαν χρήστες.</td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const meta = ROLE_META[u.role];
                    const sp = u.staffProfile;
                    const homerooms = [
                      ...(sp?.homeroomGroups.map((g) => g.name) ?? []),
                      ...(sp?.homeroomHeadGroups.map((g) => `${g.name} (B')`) ?? []),
                    ];
                    return (
                      <tr key={u.id} className={cn("hover:bg-slate-50", !u.isActive && "opacity-50")}>
                        <td className="px-5 py-3">
                          <Link
                            href={`/${locale}/admin/users/${u.id}`}
                            className="font-medium text-slate-900 hover:text-emerald-700"
                          >
                            {sp?.scheduleName ?? u.name ?? "—"}
                          </Link>
                          {sp?.scheduleName && u.name && sp.scheduleName !== u.name && (
                            <p className="text-xs text-slate-400 mt-0.5">{u.name}</p>
                          )}
                          {u.nameEl && u.nameEl !== u.name && (
                            <p className="text-xs text-slate-400 mt-0.5">{u.nameEl}</p>
                          )}
                          {!u.isActive && (
                            <span className="text-[11px] text-slate-400">Ανενεργός</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {meta && (
                              <Badge variant="outline" className={cn("text-xs font-medium", meta.color)}>
                                {meta.label}
                              </Badge>
                            )}
                            {u.extraRoles.includes("SUPER_ADMIN") && (
                              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                +Διαχειριστής
                              </Badge>
                            )}
                            {sp?.specialEducation && (
                              <Badge variant="outline" className="text-xs bg-rose-50 text-rose-700 border-rose-200">
                                Ειδ. Εκπ.
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{u.email}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {sp?.phone ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500 text-xs">
                          {sp ? sp._count.timetableSlots : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {homerooms.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {homerooms.map((n) => (
                                <Badge key={n} variant="outline" className="text-xs text-slate-600">{n}</Badge>
                              ))}
                            </div>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {sp ? (
                            <StaffLinkControls
                              staffProfileId={sp.id}
                              linkedUserId={u.id}
                              linkedUserName={u.name}
                              availableUsers={linkableUsers}
                            />
                          ) : (
                            <span className="text-xs text-slate-400">Χωρίς προφίλ</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
