import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, CircleUser, Home, Calendar, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { RolesCard } from "./RolesCard";
import { SetPasswordForm } from "./SetPasswordForm";
import { DeleteUserCard } from "./DeleteUserCard";

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

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login`);

  const t = await getTranslations("adminUsers");
  const tRoles = await getTranslations("roles");

  const user = await db.user.findUnique({
    where: { id },
    include: {
      staffProfile: {
        include: {
          homeroomGroups: { select: { id: true, name: true } },
          homeroomHeadGroups: { select: { id: true, name: true } },
          homeroomCounselorGroups: { select: { id: true, name: true } },
          _count: { select: { timetableSlots: true } },
          timetableSlots: {
            where: { staffName: { not: null } },
            select: { staffName: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!user) notFound();

  const roleColor = ROLE_COLOR[user.role];
  const sp = user.staffProfile;
  const scheduleName = sp?.scheduleName ?? sp?.timetableSlots[0]?.staffName ?? null;
  const hasAdminGrant = user.extraRoles.includes("SUPER_ADMIN");

  // Could revoking this user's grant leave the system without any admin?
  const effectiveSuperAdmins = await db.user.count({
    where: {
      isActive: true,
      OR: [{ role: "SUPER_ADMIN" }, { extraRoles: { has: "SUPER_ADMIN" } }],
    },
  });

  const infoRow = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right">{value ?? "—"}</span>
    </div>
  );

  const groupChips = (groups: { id: string; name: string }[]) =>
    groups.length > 0 ? (
      <div className="flex flex-wrap gap-1 justify-end">
        {groups.map((g) => (
          <Link key={g.id} href={`/${locale}/admin/groups/${g.id}`}>
            <Badge variant="outline" className="text-xs hover:border-slate-400 cursor-pointer">
              {g.name}
            </Badge>
          </Link>
        ))}
      </div>
    ) : (
      <span className="text-slate-300">—</span>
    );

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/${locale}/admin/users`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("title")}
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{scheduleName ?? user.name ?? "—"}</h2>
            {scheduleName && user.name && scheduleName !== user.name && (
              <p className="text-slate-500 text-sm mt-0.5">{user.name}</p>
            )}
            {user.nameEl && user.nameEl !== user.name && (
              <p className="text-slate-500 text-sm mt-0.5">{user.nameEl}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {roleColor && (
              <Badge variant="outline" className={cn("text-sm font-medium", roleColor)}>
                {tRoles(user.role)}
              </Badge>
            )}
            {hasAdminGrant && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-sm">
                {t("badgeSystemAdmin")}
              </Badge>
            )}
            {sp?.specialEducation && (
              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-sm">
                {t("badgeSpecialEducation")}
              </Badge>
            )}
            {!user.isActive && (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-sm">
                {t("inactive")}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Personal information */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CircleUser className="w-4 h-4" />
              {t("personalInfo")}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-slate-50">
            {infoRow(t("email"), user.email)}
            {infoRow(t("phone"), sp?.phone)}
            {infoRow(t("department"), sp?.department)}
            {infoRow(t("pmp"), sp?.pmp ? <span className="font-mono">{sp.pmp}</span> : null)}
            {infoRow(t("scheduleName"), scheduleName ? <span className="font-mono">{scheduleName}</span> : null)}
          </CardContent>
        </Card>

        {/* Assignments */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="w-4 h-4" />
              {t("assignments")}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-slate-50">
            {infoRow(t("homegroupTeacher"), sp ? groupChips(sp.homeroomGroups) : null)}
            {infoRow(t("homegroupHeadteacher"), sp ? groupChips(sp.homeroomHeadGroups) : null)}
            {infoRow(t("counselorOf"), sp ? groupChips(sp.homeroomCounselorGroups) : null)}
            {infoRow(
              t("timetableSlots"),
              sp ? (
                scheduleName ? (
                  <Link
                    href={`/${locale}/admin/timetable?teacher=${encodeURIComponent(scheduleName)}`}
                    className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {sp._count.timetableSlots}
                  </Link>
                ) : (
                  sp._count.timetableSlots
                )
              ) : null
            )}
          </CardContent>
        </Card>
      </div>

      <RolesCard
        userId={user.id}
        userName={user.name ?? user.email}
        isPrimaryAdmin={user.role === "SUPER_ADMIN"}
        hasAdminGrant={hasAdminGrant}
        isSelf={auth.userId === user.id}
        isLastSuperAdmin={hasAdminGrant && effectiveSuperAdmins <= 1}
        hasStaffProfile={!!sp}
        specialEducation={sp?.specialEducation ?? false}
        substitutionCoordinator={sp?.substitutionCoordinator ?? false}
        ddkCoordinator={sp?.ddkCoordinator ?? false}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            {t("passwordSignIn")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 mb-4">
            {t("passwordSignInHint")}
          </p>
          <SetPasswordForm userId={user.id} />
        </CardContent>
      </Card>

      {!sp && (
        <p className="text-sm text-slate-400">
          {t("noStaffProfileLinked")}
        </p>
      )}

      <DeleteUserCard
        userId={user.id}
        userName={user.name ?? user.email ?? t("thisUser")}
        locale={locale}
        isSelf={auth.userId === user.id}
        isLastAdmin={
          (user.role === "SUPER_ADMIN" || hasAdminGrant) && effectiveSuperAdmins <= 1
        }
      />
    </div>
  );
}
