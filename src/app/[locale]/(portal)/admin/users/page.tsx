import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import type { Role } from "@/generated/prisma/client";
import { getTranslations } from "next-intl/server";
import { StaffLinkControls } from "@/components/staff/StaffLinkControls";
import { SuggestInput } from "@/components/SuggestInput";
import { suggestionList } from "@/lib/textSearch";
import { pickQueryString } from "@/lib/listFilters";
import { STAFF_ROLES } from "@/lib/rbac";
import {
  type StaffRow,
  STAFF_KEYS,
  filterStaff,
  sortStaff,
  staffSpecialties,
  staffStatus,
  isManagementRow,
  staffRowLabel,
  lessonsByName,
  migrateLegacyRole,
} from "@/lib/staffFilter";
import { isManagementName } from "@/lib/substitutions";

const ROLE_COLOR: Record<string, string> = {
  SUPER_ADMIN:       "bg-purple-100 text-purple-700 border-purple-200",
  HEADMASTER:        "bg-slate-800 text-white border-slate-800",
  HEADTEACHER_A:     "bg-blue-100 text-blue-700 border-blue-200",
  HEADTEACHER_B:     "bg-indigo-100 text-indigo-700 border-indigo-200",
  STUDENT_COUNSELOR: "bg-teal-100 text-teal-700 border-teal-200",
  TEACHER:           "bg-emerald-100 text-emerald-700 border-emerald-200",
  SCHOOL_ADMIN:      "bg-amber-100 text-amber-700 border-amber-200",
  CHAPERONE:         "bg-orange-100 text-orange-700 border-orange-200",
};

// Roles offered as pills, in seniority order. Only those actually present on
// the roster are rendered — a pill that can only ever return nothing is noise.
const ROLE_PILLS: Role[] = [
  "HEADMASTER",
  "HEADTEACHER_A",
  "HEADTEACHER_B",
  "STUDENT_COUNSELOR",
  "TEACHER",
  "SCHOOL_ADMIN",
  "SUPER_ADMIN",
];

const POST_PILLS = ["specialEd", "ddk", "subCoord", "homeroom", "extraAdmin"] as const;

/**
 * The admin staff roster.
 *
 * One list of everyone, not two. Before, the page showed only the ~16 people
 * with a login and hid the ~124 roster entries the timetable import created
 * behind a separate tab and a separate table — so an admin looking for a named
 * teacher had to guess which of the two they were in, with no search box in
 * either. Here every filter runs over the whole roster at once.
 */
export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    status?: string;
    sp?: string;
    role?: string;
    post?: string;
    q?: string;
  }>;
}) {
  const { locale } = await params;
  const raw = await searchParams;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login/staff`);

  const t = await getTranslations("adminUsers");
  const tRoles = await getTranslations("roles");

  // `?role=` used to mean three different things at once. Translate the old
  // values so a bookmark or a still-open tab lands somewhere sensible.
  const legacy = migrateLegacyRole(raw.role);
  const current = {
    status: raw.status ?? legacy.status,
    sp: raw.sp,
    role: legacy.role,
    post: raw.post ?? legacy.post,
    q: (raw.q ?? "").trim(),
  };

  const [profiles, accountsWithoutProfile, slotCounts] = await Promise.all([
    db.staffProfile.findMany({
      include: {
        user: {
          select: {
            id: true, name: true, nameEl: true, email: true,
            role: true, isActive: true, extraRoles: true,
          },
        },
        homeroomGroups: { select: { name: true } },
        homeroomHeadGroups: { select: { name: true } },
      },
    }),
    // Staff who never appear in the schedule and so have no profile — the
    // secretary and the system admin. Also the pool of accounts a roster entry
    // can be linked to, once the inactive ones are dropped.
    db.user.findMany({
      where: { role: { in: STAFF_ROLES }, staffProfile: null },
      select: {
        id: true, name: true, nameEl: true, email: true,
        role: true, isActive: true, extraRoles: true,
      },
      orderBy: { name: "asc" },
    }),
    // Lesson load by name. NOT by staffId: that is only stamped at claim
    // approval, so a relation count reads 0 for everyone who has not signed up.
    db.timetableSlot.groupBy({ by: ["staffName"], _count: true }),
  ]);

  const lessons = lessonsByName(slotCounts);

  const roster: StaffRow[] = [
    ...profiles.map((sp) => ({
      userId: sp.userId,
      staffProfileId: sp.id,
      scheduleName: sp.scheduleName,
      name: sp.user?.name ?? null,
      nameEl: sp.user?.nameEl ?? null,
      email: sp.user?.email ?? null,
      phone: sp.phone,
      role: sp.user?.role ?? null,
      isActive: sp.user?.isActive ?? true,
      extraAdmin: sp.user?.extraRoles.includes("SUPER_ADMIN") ?? false,
      specialEducation: sp.specialEducation,
      ddkCoordinator: sp.ddkCoordinator,
      substitutionCoordinator: sp.substitutionCoordinator,
      homerooms: [
        ...sp.homeroomGroups.map((g) => g.name),
        ...sp.homeroomHeadGroups.map((g) => `${g.name} (B')`),
      ],
      lessons: lessons.get(sp.scheduleName ?? "") ?? 0,
    })),
    ...accountsWithoutProfile.map((u) => ({
      userId: u.id,
      staffProfileId: null,
      scheduleName: null,
      name: u.name,
      nameEl: u.nameEl,
      email: u.email,
      phone: null,
      role: u.role,
      isActive: u.isActive,
      extraAdmin: u.extraRoles.includes("SUPER_ADMIN"),
      specialEducation: false,
      ddkCoordinator: false,
      substitutionCoordinator: false,
      homerooms: [],
      lessons: 0,
    })),
  ];

  const everyone = sortStaff(roster);
  const rows = filterStaff(everyone, {
    status: current.status,
    specialty: current.sp,
    role: current.role,
    post: current.post,
    q: current.q,
  });
  const filtered = rows.length !== everyone.length;

  const linkableUsers = accountsWithoutProfile
    .filter((u) => u.isActive)
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));

  // Every option count comes from the UNFILTERED roster, so a pill never
  // disappears because of what is currently selected.
  const count = (p: (r: StaffRow) => boolean) => everyone.filter(p).length;
  const statusPills = [
    { key: "linked",   label: t("statusLinked"),   n: count((r) => staffStatus(r) === "linked") },
    { key: "awaiting", label: t("statusAwaiting"), n: count((r) => staffStatus(r) === "awaiting") },
    { key: "orphaned", label: t("statusOrphaned"), n: count((r) => staffStatus(r) === "orphaned") },
  ].filter((p) => p.n > 0);
  const specialties = staffSpecialties(everyone);
  const rolePills = [
    { key: "management", label: t("roleManagement"), n: count(isManagementRow) },
    ...ROLE_PILLS.map((r) => ({ key: r as string, label: tRoles(r), n: count((x) => x.role === r) })),
  ].filter((p) => p.n > 0);
  const postPills = POST_PILLS.map((key) => ({
    key,
    label: t(`post_${key}`),
    n: filterStaff(everyone, { post: key }).length,
  })).filter((p) => p.n > 0);

  const hrefWith = (
    over: Partial<Record<(typeof STAFF_KEYS)[number], string | undefined>>,
  ) => pickQueryString({ ...current, ...over }, STAFF_KEYS) || "?";

  // Carried onto every row link so the record's back button returns to this view.
  const listFilters = pickQueryString(current, STAFF_KEYS);

  const suggestions = suggestionList([
    ...everyone.map((r) => r.scheduleName),
    ...everyone.map((r) => r.name),
  ]);

  const pill = (active: boolean, tone: "emerald" | "slate" | "sky" | "purple") =>
    cn(
      "h-9 px-3 rounded-xl text-sm font-medium transition-colors border",
      active
        ? {
            emerald: "bg-emerald-600 text-white border-emerald-600",
            slate:   "bg-slate-800 text-white border-slate-800",
            sky:     "bg-sky-700 text-white border-sky-700",
            purple:  "bg-purple-600 text-white border-purple-600",
          }[tone]
        : {
            emerald: "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700",
            slate:   "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800",
            sky:     "bg-white text-slate-600 border-slate-200 hover:border-sky-400 hover:text-sky-700",
            purple:  "bg-white text-purple-700 border-purple-200 hover:border-purple-400",
          }[tone],
    );

  const caption = "text-xs font-semibold text-slate-400 uppercase tracking-wide";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">
          {filtered
            ? t("showingCount", { shown: rows.length, total: everyone.length })
            : t("rosterSummary", {
                total: everyone.length,
                linked: count((r) => staffStatus(r) === "linked"),
              })}
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <p className={caption}>{t("filterStatus")}</p>
          <div className="flex gap-2 flex-wrap">
            <Link href={hrefWith({ status: undefined })} className={pill(!current.status, "emerald")}>
              {t("statusAll")}
              <span className="ml-1.5 text-xs opacity-70">{everyone.length}</span>
            </Link>
            {statusPills.map((p) => (
              <Link
                key={p.key}
                href={hrefWith({ status: p.key === current.status ? undefined : p.key })}
                className={cn(
                  pill(current.status === p.key, "emerald"),
                  // Orphans are the only genuinely wrong state — a profile whose
                  // user was deleted. The 124 awaiting sign-up are expected, and
                  // painting them amber would make the alarm permanent.
                  p.key === "orphaned" &&
                    current.status !== p.key &&
                    "text-amber-600 border-amber-200 hover:border-amber-400",
                )}
              >
                {p.label}
                <span className="ml-1.5 text-xs opacity-70">{p.n}</span>
              </Link>
            ))}
          </div>
        </div>

        {specialties.length > 0 && (
          <div className="space-y-1.5">
            <p className={caption}>{t("filterSpecialty")}</p>
            <div className="flex gap-2 flex-wrap">
              {specialties.map((s) => (
                <Link
                  key={s.code}
                  href={hrefWith({ sp: s.code === current.sp ? undefined : s.code })}
                  className={cn(pill(current.sp === s.code, "slate"), "font-semibold")}
                >
                  {s.code}
                  <span className="ml-1.5 text-xs font-normal opacity-70">{s.count}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {rolePills.length > 0 && (
          <div className="space-y-1.5">
            <p className={caption}>{t("filterRole")}</p>
            <div className="flex gap-2 flex-wrap">
              {rolePills.map((p) => (
                <Link
                  key={p.key}
                  href={hrefWith({ role: p.key === current.role ? undefined : p.key })}
                  className={pill(current.role === p.key, "sky")}
                >
                  {p.label}
                  <span className="ml-1.5 text-xs opacity-70">{p.n}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {postPills.length > 0 && (
          <div className="space-y-1.5">
            <p className={caption}>{t("filterPost")}</p>
            <div className="flex gap-2 flex-wrap">
              {postPills.map((p) => (
                <Link
                  key={p.key}
                  href={hrefWith({ post: p.key === current.post ? undefined : p.key })}
                  className={pill(current.post === p.key, "purple")}
                >
                  {p.label}
                  <span className="ml-1.5 text-xs opacity-70">{p.n}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <form method="GET" className="flex items-end gap-2">
          {/* Keep the pill selection alive when the box is submitted with Enter */}
          {current.status && <input type="hidden" name="status" value={current.status} />}
          {current.sp && <input type="hidden" name="sp" value={current.sp} />}
          {current.role && <input type="hidden" name="role" value={current.role} />}
          {current.post && <input type="hidden" name="post" value={current.post} />}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <SuggestInput
              name="q"
              defaultValue={current.q}
              placeholder={t("searchPlaceholder")}
              suggestions={suggestions}
              className="h-9 w-64 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {filtered && (
            <Link href="?" className="h-9 px-3 inline-flex items-center text-sm text-slate-500 hover:text-slate-800">
              {t("clearFilters")}
            </Link>
          )}
        </form>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thName")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thRole")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thEmail")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thPhone")}</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thSlots")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thHomegroups")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thAccount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                    {everyone.length === 0 ? t("noUsersFound") : t("noMatches")}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const status = staffStatus(r);
                  const label = staffRowLabel(r) || "—";
                  // The schedule marker is the only clue to a deputy who has not
                  // signed up yet, but it is the timetable's word, not a granted
                  // role — so it is badged separately and labelled as such.
                  const scheduleMarker =
                    !r.role && isManagementName(r.scheduleName)
                      ? r.scheduleName!.trim().split(/\s+/).pop()!
                      : null;
                  return (
                    <tr
                      key={r.userId ?? r.staffProfileId}
                      className={cn("hover:bg-slate-50", r.userId && !r.isActive && "opacity-50")}
                    >
                      <td className="px-5 py-3">
                        {r.userId ? (
                          <Link
                            href={`/${locale}/admin/users/${r.userId}${listFilters}`}
                            className="font-medium text-slate-900 hover:text-emerald-700"
                          >
                            {label}
                          </Link>
                        ) : (
                          <span className="font-medium text-slate-700">{label}</span>
                        )}
                        {r.scheduleName && r.name && r.scheduleName !== r.name && (
                          <p className="text-xs text-slate-400 mt-0.5">{r.name}</p>
                        )}
                        {r.nameEl && r.nameEl !== r.name && (
                          <p className="text-xs text-slate-400 mt-0.5">{r.nameEl}</p>
                        )}
                        {r.userId && !r.isActive && (
                          <span className="text-[11px] text-slate-400">{t("inactive")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.role && ROLE_COLOR[r.role] && (
                            <Badge variant="outline" className={cn("text-xs font-medium", ROLE_COLOR[r.role])}>
                              {tRoles(r.role)}
                            </Badge>
                          )}
                          {scheduleMarker && (
                            <Badge
                              variant="outline"
                              title={t("badgeScheduleMarkerHint")}
                              className="text-xs bg-slate-50 text-slate-500 border-slate-200"
                            >
                              {t("badgeScheduleMarker", { marker: scheduleMarker })}
                            </Badge>
                          )}
                          {r.extraAdmin && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                              {t("badgeExtraAdmin")}
                            </Badge>
                          )}
                          {r.specialEducation && (
                            <Badge variant="outline" className="text-xs bg-rose-50 text-rose-700 border-rose-200">
                              {t("badgeSpecialEdShort")}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {r.email ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {r.phone ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-500 text-xs">
                        {r.lessons > 0 ? r.lessons : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.homerooms.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.homerooms.map((n) => (
                              <Badge key={n} variant="outline" className="text-xs text-slate-600">{n}</Badge>
                            ))}
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {!r.staffProfileId && (
                          <span className="text-xs text-slate-400">{t("noProfile")}</span>
                        )}
                        {r.staffProfileId && (
                          <div className="flex items-center gap-2">
                            <StaffLinkControls
                              staffProfileId={r.staffProfileId}
                              linkedUserId={r.userId}
                              linkedUserName={r.name}
                              availableUsers={linkableUsers}
                              showUnlinkedLabel={false}
                            />
                            {status === "awaiting" && (
                              <span className="text-xs text-slate-400">{t("accountAwaiting")}</span>
                            )}
                            {status === "orphaned" && (
                              <span className="text-xs text-amber-600 font-medium">{t("accountOrphaned")}</span>
                            )}
                          </div>
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
    </div>
  );
}
