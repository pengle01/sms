import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { canManageClaims, REGISTRATION_ROLES } from "@/lib/rbac";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma/client";
import { RequestsList } from "./RequestsList";
import { normalizeStaffName } from "@/lib/staffLink";
import { roleNeededFor, roleFitsPosts } from "@/lib/homegroupStaff";
import { expectedSignupRole } from "@/lib/staffRole";
import type { PendingUser, PendingClaim, PendingChaperone } from "./RequestsList";

export default async function ClaimsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  // Effective roles: a teacher with an extra SUPER_ADMIN grant manages claims.
  if (!auth || !auth.roles.some(canManageClaims)) {
    redirect(`/${locale}/login/staff`);
  }

  const [rawUsers, rawClaims, rawChaperones] = await Promise.all([
    db.user.findMany({
      // Sign-ups only — a deactivated student or parent is inactive too, but is
      // not a request (see isPendingRegistration).
      where: { isActive: false, role: { in: REGISTRATION_ROLES } },
      orderBy: { createdAt: "asc" },
      include: { teacherClaim: true },
    }),
    db.teacherClaim.findMany({
      where: { status: "PENDING", user: { isActive: true } },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    db.chaperoneRequest.findMany({
      where: { status: "PENDING" },
      include: {
        user: true,
        students: {
          include: { studentProfile: { include: { user: { select: { name: true } } } } },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Homegroup posts already assigned to a sign-up's timetable name (before they
  // had an account): shown so the admin approves the role those posts need.
  const unclaimedProfiles = await db.staffProfile.findMany({
    where: { userId: null, scheduleName: { not: null } },
    select: {
      scheduleName: true,
      plannedRole: true,
      homeroomGroups: { select: { name: true } },
      homeroomHeadGroups: { select: { name: true } },
      homeroomCounselorGroups: { select: { name: true } },
    },
  });
  const postsByName = new Map(
    unclaimedProfiles.map((p) => [
      normalizeStaffName(p.scheduleName!),
      {
        teacherOf: p.homeroomGroups.map((g) => g.name),
        headteacherOf: p.homeroomHeadGroups.map((g) => g.name),
        counselorOf: p.homeroomCounselorGroups.map((g) => g.name),
        expected: expectedSignupRole({ plannedRole: p.plannedRole, scheduleName: p.scheduleName }),
      },
    ]),
  );

  const registrations: PendingUser[] = rawUsers.map((u) => ({
    id: u.id,
    name: u.name ?? "",
    email: u.email,
    role: u.role as Role,
    staffName: u.teacherClaim?.staffName,
    createdAt: u.createdAt.toISOString(),
    ...(() => {
      const posts = u.teacherClaim ? postsByName.get(normalizeStaffName(u.teacherClaim.staffName)) : undefined;
      if (!posts) return {};
      // The homegroup posts decide first; otherwise the admin's planned role or
      // the timetable marker. The teacher's own choice stands — this only warns.
      // Homegroup posts decide first (a deputy post suits Deputy A or B);
      // otherwise the planned role or the timetable marker.
      const needed = roleNeededFor(posts);
      if (needed) return { posts, roleMismatch: roleFitsPosts(u.role, posts) ? undefined : needed };
      const expected = posts.expected;
      return { posts, roleMismatch: expected !== null && expected !== u.role ? expected : undefined };
    })(),
  }));

  const teacherClaims: PendingClaim[] = rawClaims.map((c) => ({
    id: c.id,
    name: c.user?.name ?? "",
    email: c.user.email,
    staffName: c.staffName,
    createdAt: c.createdAt.toISOString(),
  }));

  const chaperoneRequests: PendingChaperone[] = rawChaperones.map((r) => ({
    id: r.id,
    name: r.user?.name ?? "",
    email: r.user.email,
    note: r.note ?? undefined,
    students: r.students.map((s) => ({ id: s.studentProfile.id, name: s.studentProfile.user?.name ?? "—" })),
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <RequestsList
      registrations={registrations}
      teacherClaims={teacherClaims}
      chaperoneRequests={chaperoneRequests}
    />
  );
}
