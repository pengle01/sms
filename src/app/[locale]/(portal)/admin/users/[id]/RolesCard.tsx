"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ShieldCheck, ShieldOff, HeartHandshake, ArrowLeftRight, Award, Wrench, MessageSquare, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Role } from "@/generated/prisma/client";
import { STAFF_PROFILE_ROLES } from "@/lib/staffRole";
import { grantSuperAdmin, revokeSuperAdmin, setSpecialEducation, setSubstitutionCoordinator, setDdkCoordinator, setItMaintenance, setParentMessaging, setUserRole } from "./actions";

interface Props {
  userId: string;
  userName: string;
  /** Target's primary role is SUPER_ADMIN (managed at approval, not here). */
  isPrimaryAdmin: boolean;
  /** Target currently holds the extra SUPER_ADMIN grant. */
  hasAdminGrant: boolean;
  /** Viewing your own account — access changes are disabled. */
  isSelf: boolean;
  /** Revoking would leave the system without any super admin. */
  isLastSuperAdmin: boolean;
  /** Has a staff profile (required for the special-education designation). */
  hasStaffProfile: boolean;
  specialEducation: boolean;
  substitutionCoordinator: boolean;
  ddkCoordinator: boolean;
  itMaintenance: boolean;
  parentMessaging: boolean;
  /** The account's primary role (changeable here between educator roles). */
  currentRole: Role;
}

export function RolesCard({
  userId,
  userName,
  isPrimaryAdmin,
  hasAdminGrant,
  isSelf,
  isLastSuperAdmin,
  hasStaffProfile,
  specialEducation,
  substitutionCoordinator,
  ddkCoordinator,
  itMaintenance,
  parentMessaging,
  currentRole,
}: Props) {
  const t = useTranslations("adminUsers");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(res.error ?? t("somethingWentWrong"));
      }
    });
  }

  const row = (label: string, control: React.ReactNode, hint?: string) => (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );

  // ── Educator role (teacher ↔ counselor ↔ deputies ↔ headmaster) ─────────
  const tRoles = useTranslations("roles");
  const canChangeRole = STAFF_PROFILE_ROLES.includes(currentRole);
  const roleControl = !canChangeRole ? (
    <span className="text-xs text-slate-500">{tRoles(currentRole)}</span>
  ) : (
    <select
      aria-label={t("rowRole")}
      disabled={pending || isSelf}
      value={currentRole}
      onChange={(e) => {
        const next = e.target.value as Role;
        run(() => setUserRole(userId, next), t("roleChanged", { role: tRoles(next) }));
      }}
      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 disabled:opacity-50"
    >
      {STAFF_PROFILE_ROLES.map((r) => (
        <option key={r} value={r}>
          {tRoles(r)}
        </option>
      ))}
    </select>
  );

  // ── System administrator control ────────────────────────────────────────
  let adminControl: React.ReactNode;
  let adminHint: string | undefined;

  if (isPrimaryAdmin) {
    adminControl = <span className="text-xs font-medium text-purple-600">{t("primarySuperAdmin")}</span>;
    adminHint = t("primarySuperAdminHint");
  } else if (isSelf) {
    adminControl = <span className="text-xs text-slate-400">—</span>;
    adminHint = t("cannotChangeOwnAccess");
  } else if (hasAdminGrant) {
    adminHint = t("hasAdminGrantHint");
    adminControl = isLastSuperAdmin ? (
      <span className="text-xs text-amber-600">{t("lastAdminCannotRevoke")}</span>
    ) : (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <button
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
              {t("revokeAdminAccess")}
            </button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("revokeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("revokeConfirmDescription", { name: userName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => revokeSuperAdmin(userId), t("adminAccessRevoked"))}>
              {t("revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  } else {
    adminHint = t("grantAdminHint");
    adminControl = (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <button
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              {t("grantAdminAccess")}
            </button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("grantConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("grantConfirmDescription", { name: userName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => grantSuperAdmin(userId), t("adminAccessGranted"))}>
              {t("grantAccess")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // ── Special education designation ───────────────────────────────────────
  const specialEdControl = !hasStaffProfile ? (
    <span className="text-xs text-slate-400">{t("noStaffProfile")}</span>
  ) : (
    <button
      disabled={pending}
      onClick={() =>
        run(
          () => setSpecialEducation(userId, !specialEducation),
          specialEducation ? t("designationRemoved") : t("designationSet")
        )
      }
      className={
        specialEducation
          ? "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 disabled:opacity-50"
          : "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      }
    >
      <HeartHandshake className="w-3.5 h-3.5" />
      {specialEducation ? t("specialEdOn") : t("specialEdOff")}
    </button>
  );

  // ── Substitution coordinator designation ─────────────────────────────────
  const coordinatorControl = !hasStaffProfile ? (
    <span className="text-xs text-slate-400">{t("noStaffProfile")}</span>
  ) : (
    <button
      disabled={pending}
      onClick={() =>
        run(
          () => setSubstitutionCoordinator(userId, !substitutionCoordinator),
          substitutionCoordinator ? t("designationRemoved") : t("designationSet")
        )
      }
      className={
        substitutionCoordinator
          ? "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700 disabled:opacity-50"
          : "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      }
    >
      <ArrowLeftRight className="w-3.5 h-3.5" />
      {substitutionCoordinator ? t("subCoordOn") : t("subCoordOff")}
    </button>
  );

  // ── ΔΔΚ coordinator designation ───────────────────────────────────────────
  const ddkControl = !hasStaffProfile ? (
    <span className="text-xs text-slate-400">{t("noStaffProfile")}</span>
  ) : (
    <button
      disabled={pending}
      onClick={() =>
        run(
          () => setDdkCoordinator(userId, !ddkCoordinator),
          ddkCoordinator ? t("designationRemoved") : t("designationSet")
        )
      }
      className={
        ddkCoordinator
          ? "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50"
          : "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      }
    >
      <Award className="w-3.5 h-3.5" />
      {ddkCoordinator ? t("ddkOn") : t("ddkOff")}
    </button>
  );

  // ── IT maintenance designation ────────────────────────────────────────────
  const itControl = !hasStaffProfile ? (
    <span className="text-xs text-slate-400">{t("noStaffProfile")}</span>
  ) : (
    <button
      disabled={pending}
      onClick={() =>
        run(
          () => setItMaintenance(userId, !itMaintenance),
          itMaintenance ? t("designationRemoved") : t("designationSet")
        )
      }
      className={
        itMaintenance
          ? "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
          : "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      }
    >
      <Wrench className="w-3.5 h-3.5" />
      {itMaintenance ? t("itOn") : t("itOff")}
    </button>
  );

  // ── Parent messaging (off by default) ────────────────────────────────────
  const messagingControl = !hasStaffProfile ? (
    <span className="text-xs text-slate-400">{t("noStaffProfile")}</span>
  ) : (
    <button
      disabled={pending}
      onClick={() =>
        run(
          () => setParentMessaging(userId, !parentMessaging),
          parentMessaging ? t("parentMsgDisabled") : t("parentMsgEnabled")
        )
      }
      className={
        parentMessaging
          ? "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
          : "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      }
    >
      <MessageSquare className="w-3.5 h-3.5" />
      {parentMessaging ? t("parentMsgOn") : t("parentMsgOff")}
    </button>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          {t("rolesTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-slate-50">
        {row(t("rowRole"), roleControl, canChangeRole ? t("rowRoleHint") : undefined)}
        {row(t("rowSystemAdmin"), adminControl, adminHint)}
        {row(t("rowSpecialEd"), specialEdControl, t("rowSpecialEdHint"))}
        {row(t("rowSubCoord"), coordinatorControl, t("rowSubCoordHint"))}
        {row(t("rowDdk"), ddkControl, t("rowDdkHint"))}
        {row(t("rowIt"), itControl, t("rowItHint"))}
        {row(t("rowParentMsg"), messagingControl, t("rowParentMsgHint"))}
      </CardContent>
    </Card>
  );
}
