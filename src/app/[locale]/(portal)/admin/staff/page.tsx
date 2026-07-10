import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserX, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StaffLinkControls } from "./StaffLinkControls";
import { staffDisplayName } from "@/lib/staffName";

const ROLE_COLOR: Record<string, string> = {
  TEACHER:           "bg-emerald-100 text-emerald-700 border-emerald-200",
  HEADTEACHER_B:     "bg-indigo-100 text-indigo-700 border-indigo-200",
  HEADTEACHER_A:     "bg-blue-100 text-blue-700 border-blue-200",
  HEADMASTER:        "bg-slate-800 text-white border-slate-800",
  STUDENT_COUNSELOR: "bg-teal-100 text-teal-700 border-teal-200",
  SCHOOL_ADMIN:      "bg-amber-100 text-amber-700 border-amber-200",
};

export default async function StaffProfilesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login`);

  const t = await getTranslations("adminStaff");
  const tRoles = await getTranslations("roles");

  const [staffProfiles, linkableUsers] = await Promise.all([
    db.staffProfile.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        homeroomGroups: { select: { name: true } },
        homeroomHeadGroups: { select: { name: true } },
        _count: { select: { timetableSlots: true } },
      },
      orderBy: [{ user: { name: "asc" } }],
    }),
    // Users who could be linked: staff roles without an existing linked profile
    db.user.findMany({
      where: {
        role: { in: ["TEACHER", "HEADTEACHER_B", "HEADTEACHER_A", "HEADMASTER", "STUDENT_COUNSELOR", "SCHOOL_ADMIN"] },
        isActive: true,
        staffProfile: null,
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const linked = staffProfiles.filter((sp) => sp.userId !== null);
  const unlinked = staffProfiles.filter((sp) => sp.userId === null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">
          {t("summary", { profiles: staffProfiles.length, linked: linked.length })}
          {unlinked.length > 0 && (
            <span className="text-amber-600 font-medium"> {t("unlinkedSummary", { count: unlinked.length })}</span>
          )}
        </p>
      </div>

      {/* Unlinked profiles — prominent warning */}
      {unlinked.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
              <UserX className="w-4 h-4" />
              {t("unlinkedCardTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-amber-100">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">{t("thScheduleName")}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">{t("thSlots")}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">{t("thHomegroups")}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">{t("thLinkToUser")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {unlinked.map((sp) => {
                  const homerooms = [
                    ...sp.homeroomGroups.map((g) => g.name),
                    ...sp.homeroomHeadGroups.map((g) => `${g.name} (B')`),
                  ];
                  return (
                    <tr key={sp.id} className="hover:bg-amber-50/60">
                      <td className="px-5 py-3 font-medium text-slate-800">{sp.scheduleName ?? sp.id}</td>
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
          </CardContent>
        </Card>
      )}

      {/* All linked profiles */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
            <Users className="w-4 h-4" />
            {t("linkedProfiles", { count: linked.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thName")}</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thRole")}</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thEmail")}</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thSlots")}</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thHomegroups")}</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("thLinkedUser")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {linked.map((sp) => {
                const roleColor = ROLE_COLOR[sp.user!.role] ?? "bg-slate-100 text-slate-600";
                const homerooms = [
                  ...sp.homeroomGroups.map((g) => g.name),
                  ...sp.homeroomHeadGroups.map((g) => `${g.name} (B')`),
                ];
                return (
                  <tr key={sp.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{staffDisplayName(sp)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-xs font-medium ${roleColor}`}>
                        {tRoles(sp.user!.role)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{sp.user?.email}</td>
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
                        linkedUserId={sp.userId}
                        linkedUserName={sp.user?.name}
                        availableUsers={linkableUsers}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
