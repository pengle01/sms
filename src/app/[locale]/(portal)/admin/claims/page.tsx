import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { canManageClaims } from "@/lib/rbac";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma";
import { RequestsList } from "./RequestsList";
import type { PendingUser, PendingClaim, PendingChaperone } from "./RequestsList";

export default async function ClaimsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || !canManageClaims(session.user.role as Role)) {
    redirect(`/${locale}/login`);
  }

  const [rawUsers, rawClaims, rawChaperones] = await Promise.all([
    db.user.findMany({
      where: { isActive: false },
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

  const registrations: PendingUser[] = rawUsers.map((u) => ({
    id: u.id,
    name: u.name ?? "",
    email: u.email,
    role: u.role as Role,
    staffName: u.teacherClaim?.staffName,
    createdAt: u.createdAt.toISOString(),
  }));

  const teacherClaims: PendingClaim[] = rawClaims.map((c) => ({
    id: c.id,
    name: c.user.name ?? "",
    email: c.user.email,
    staffName: c.staffName,
    createdAt: c.createdAt.toISOString(),
  }));

  const chaperoneRequests: PendingChaperone[] = rawChaperones.map((r) => ({
    id: r.id,
    name: r.user.name ?? "",
    email: r.user.email,
    note: r.note ?? undefined,
    students: r.students.map((s) => ({ id: s.studentProfile.id, name: s.studentProfile.user.name ?? "—" })),
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
