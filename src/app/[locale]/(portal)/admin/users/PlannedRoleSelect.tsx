"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Role } from "@/generated/prisma/client";
import { STAFF_PROFILE_ROLES } from "@/lib/staffRole";
import { setPlannedRole } from "./[id]/actions";

/**
 * Role of a roster entry that has no account yet. Empty = follow the timetable
 * name (shown as "from the timetable: …"), so a correctly marked name needs
 * nothing; set it for a deputy whose name lacks «ΒΔ», or a teacher with deputy duties.
 */
export function PlannedRoleSelect({
  staffProfileId,
  plannedRole,
  nameRole,
}: {
  staffProfileId: string;
  plannedRole: Role | null;
  nameRole: Role;
}) {
  const t = useTranslations("adminUsers");
  const tRoles = useTranslations("roles");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label={t("plannedRoleLabel")}
      title={t("plannedRoleHint")}
      disabled={pending}
      value={plannedRole ?? ""}
      onChange={(e) => {
        const value = (e.target.value || null) as Role | null;
        startTransition(async () => {
          const res = await setPlannedRole(staffProfileId, value);
          if (res.ok) {
            toast.success(t("plannedRoleSaved"));
            router.refresh();
          } else toast.error(res.error);
        });
      }}
      className="h-7 max-w-[11rem] rounded-md border border-slate-200 bg-white px-1.5 text-xs text-slate-600 disabled:opacity-50"
    >
      <option value="">{t("plannedRoleFromName", { role: tRoles(nameRole) })}</option>
      {STAFF_PROFILE_ROLES.map((r) => (
        <option key={r} value={r}>
          {tRoles(r)}
        </option>
      ))}
    </select>
  );
}
