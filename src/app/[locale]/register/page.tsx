import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { getPortalForRole } from "@/lib/rbac";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma/client";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { locale } = await params;
  const { error, success } = await searchParams;

  const session = await getServerSession(authOptions);
  if (session?.user) {
    const portal = getPortalForRole(session.user.role as Role);
    redirect(`/${locale}/${portal}`);
  }

  // Fetch distinct unclaimed staff names for the teacher picker
  const claimedNames = await db.teacherClaim
    .findMany({ where: { status: { not: "REJECTED" } }, select: { staffName: true } })
    .then((rows) => new Set(rows.map((r) => r.staffName)));

  const staffNames = await db.timetableSlot
    .findMany({
      where: { staffName: { not: null }, staffId: null },
      select: { staffName: true },
      distinct: ["staffName"],
      orderBy: { staffName: "asc" },
    })
    .then((rows) =>
      rows
        .map((r) => r.staffName!)
        .filter((n) => !claimedNames.has(n))
    );

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #064e3b 100%)" }}
    >
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-lime-400 shadow-lg shadow-emerald-900/50 mb-4">
            <svg className="w-8 h-8 text-emerald-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
          </div>
          <p className="text-emerald-300/70 text-sm">School Management System</p>
        </div>

        <RegisterForm
          locale={locale}
          error={error}
          success={success === "1"}
          staffNames={staffNames}
        />
      </div>
    </div>
  );
}
