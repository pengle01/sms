import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma";

const ROLE_TABS: { role: Role; label: string }[] = [
  { role: "TEACHER",          label: "Teachers" },
  { role: "HEADMASTER",       label: "Headmaster" },
  { role: "HEADTEACHER_A",    label: "Deputy A" },
  { role: "HEADTEACHER_B",    label: "Deputy B" },
  { role: "STUDENT_COUNSELOR",label: "Counselors" },
  { role: "CHAPERONE",        label: "Chaperones" },
  { role: "SCHOOL_ADMIN",     label: "Office Admin" },
  { role: "SUPER_ADMIN",      label: "Super Admin" },
];

const STAFF_ROLES: Role[] = [
  "TEACHER", "HEADMASTER", "HEADTEACHER_A", "HEADTEACHER_B", "STUDENT_COUNSELOR", "SCHOOL_ADMIN", "SUPER_ADMIN",
];

export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const { locale } = await params;
  const { role: roleParam } = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/login`);

  const selectedRole: Role = (ROLE_TABS.find((t) => t.role === roleParam)?.role) ?? "TEACHER";
  const isStaffRole = STAFF_ROLES.includes(selectedRole);

  const users = await db.user.findMany({
    where: { role: selectedRole },
    include: isStaffRole
      ? { staffProfile: { select: { id: true } } }
      : undefined,
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Users</h2>
        <p className="text-slate-500 text-sm mt-1">{users.length} {ROLE_TABS.find(t => t.role === selectedRole)?.label ?? selectedRole}</p>
      </div>

      {/* Role tabs */}
      <div className="flex flex-wrap gap-2">
        {ROLE_TABS.map(({ role, label }) => (
          <Link
            key={role}
            href={`?role=${role}`}
            className={cn(
              "h-9 px-4 rounded-lg text-sm font-medium border transition-colors",
              selectedRole === role
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800"
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* User list */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {users.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-400">No users with this role.</p>
            ) : (
              users.map((u) => {
                const hasProfile = isStaffRole && "staffProfile" in u && !!u.staffProfile;
                return (
                  <div key={u.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-900">{u.name ?? "—"}</p>
                        {u.nameEl && u.nameEl !== u.name && (
                          <p className="text-sm text-slate-400">{u.nameEl}</p>
                        )}
                        {!u.isActive && (
                          <Badge variant="outline" className="text-xs text-slate-400 border-slate-200">Inactive</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {selectedRole === "TEACHER" && (
                        hasProfile
                          ? <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">Linked</Badge>
                          : <Badge variant="outline" className="text-amber-600 border-amber-200 text-xs">No profile</Badge>
                      )}
                      {u.entraId
                        ? <span className="text-[11px] text-slate-300">Entra</span>
                        : <span className="text-[11px] text-slate-300">Local</span>
                      }
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
