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
import { ShieldCheck, ShieldOff, HeartHandshake, Loader2 } from "lucide-react";
import { grantSuperAdmin, revokeSuperAdmin, setSpecialEducation } from "./actions";

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
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(res.error ?? "Something went wrong");
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

  // ── System administrator control ────────────────────────────────────────
  let adminControl: React.ReactNode;
  let adminHint: string | undefined;

  if (isPrimaryAdmin) {
    adminControl = <span className="text-xs font-medium text-purple-600">Primary Super Admin</span>;
    adminHint = "This account's main role is Super Admin.";
  } else if (isSelf) {
    adminControl = <span className="text-xs text-slate-400">—</span>;
    adminHint = "You cannot change your own access.";
  } else if (hasAdminGrant) {
    adminHint = "Has full system administration access on top of their normal role.";
    adminControl = isLastSuperAdmin ? (
      <span className="text-xs text-amber-600">Last administrator — cannot revoke</span>
    ) : (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <button
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
              Revoke admin access
            </button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke administrator access?</AlertDialogTitle>
            <AlertDialogDescription>
              {userName} will immediately lose access to the admin portal and all
              administration functions. Their normal role and features are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => revokeSuperAdmin(userId), "Admin access revoked")}>
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  } else {
    adminHint = "Grants full system administration on top of their normal role.";
    adminControl = (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <button
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Grant admin access
            </button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Grant administrator access?</AlertDialogTitle>
            <AlertDialogDescription>
              {userName} will gain FULL system administration access — all student data,
              settings, user management and audit logs — while keeping their current role
              and portal. The change takes effect immediately and is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => grantSuperAdmin(userId), "Admin access granted")}>
              Grant access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // ── Special education designation ───────────────────────────────────────
  const specialEdControl = !hasStaffProfile ? (
    <span className="text-xs text-slate-400">No staff profile</span>
  ) : (
    <button
      disabled={pending}
      onClick={() =>
        run(
          () => setSpecialEducation(userId, !specialEducation),
          specialEducation ? "Designation removed" : "Designation set"
        )
      }
      className={
        specialEducation
          ? "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 disabled:opacity-50"
          : "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      }
    >
      <HeartHandshake className="w-3.5 h-3.5" />
      {specialEducation ? "Ειδική Εκπαίδευση ✓" : "Set as special education"}
    </button>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Roles & Designations
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-slate-50">
        {row("System administrator", adminControl, adminHint)}
        {row(
          "Special education (Βοηθός Διευθυντής)",
          specialEdControl,
          "Deputy B responsible for special education."
        )}
      </CardContent>
    </Card>
  );
}
