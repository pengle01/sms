import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, CircleUser, Home, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { RolesCard } from "./RolesCard";

const ROLE_META: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN:       { label: "Super Admin",  color: "bg-purple-100 text-purple-700 border-purple-200" },
  HEADMASTER:        { label: "Headmaster",   color: "bg-slate-800 text-white border-slate-800" },
  HEADTEACHER_A:     { label: "Deputy A",     color: "bg-blue-100 text-blue-700 border-blue-200" },
  HEADTEACHER_B:     { label: "Deputy B",     color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  STUDENT_COUNSELOR: { label: "Counselor",    color: "bg-teal-100 text-teal-700 border-teal-200" },
  TEACHER:           { label: "Teacher",      color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  SCHOOL_ADMIN:      { label: "Office Admin", color: "bg-amber-100 text-amber-700 border-amber-200" },
  CHAPERONE:         { label: "Chaperone",    color: "bg-orange-100 text-orange-700 border-orange-200" },
};

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login`);

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

  const meta = ROLE_META[user.role];
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
          Staff
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
            {meta && (
              <Badge variant="outline" className={cn("text-sm font-medium", meta.color)}>
                {meta.label}
              </Badge>
            )}
            {hasAdminGrant && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-sm">
                + System Admin
              </Badge>
            )}
            {sp?.specialEducation && (
              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-sm">
                Ειδική Εκπαίδευση
              </Badge>
            )}
            {!user.isActive && (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-sm">
                Inactive
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
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-slate-50">
            {infoRow("Email", user.email)}
            {infoRow("Phone", sp?.phone)}
            {infoRow("Department", sp?.department)}
            {infoRow("ΠΜΠ", sp?.pmp ? <span className="font-mono">{sp.pmp}</span> : null)}
            {infoRow("Schedule name", scheduleName ? <span className="font-mono">{scheduleName}</span> : null)}
          </CardContent>
        </Card>

        {/* Assignments */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="w-4 h-4" />
              Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-slate-50">
            {infoRow("Homegroup teacher", sp ? groupChips(sp.homeroomGroups) : null)}
            {infoRow("Homegroup headteacher", sp ? groupChips(sp.homeroomHeadGroups) : null)}
            {infoRow("Counselor of", sp ? groupChips(sp.homeroomCounselorGroups) : null)}
            {infoRow(
              "Timetable slots",
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
      />

      {!sp && (
        <p className="text-sm text-slate-400">
          No staff profile linked to this account — link one from the Staff list to see schedule data.
        </p>
      )}
    </div>
  );
}
