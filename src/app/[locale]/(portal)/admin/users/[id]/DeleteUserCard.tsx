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
import { Trash2, TriangleAlert, Loader2 } from "lucide-react";
import { deleteUser } from "./actions";

interface Props {
  userId: string;
  userName: string;
  locale: string;
  /** Viewing your own account — deletion is disabled. */
  isSelf: boolean;
  /** Deleting would leave the system without any super admin. */
  isLastAdmin: boolean;
}

export function DeleteUserCard({ userId, userName, locale, isSelf, isLastAdmin }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const blockedReason = isSelf
    ? "You cannot delete your own account."
    : isLastAdmin
      ? "Last administrator — cannot delete."
      : null;

  function onConfirm() {
    startTransition(async () => {
      const res = await deleteUser(userId);
      if (res.ok) {
        toast.success("User deleted");
        router.push(`/${locale}/admin/users`);
      } else {
        toast.error(res.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-red-700">
          <TriangleAlert className="w-4 h-4" />
          Danger zone
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Delete this user</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Permanently removes the login and frees the timetable name so another person can claim
              that role. The staff profile is kept (detached) so attendance, referral, substitution
              and message history is preserved. An account with its own admin activity (audit log,
              resolved referrals, substitution plans) cannot be deleted.
            </p>
          </div>
          <div className="flex-shrink-0">
            {blockedReason ? (
              <span className="text-xs text-amber-600">{blockedReason}</span>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <button
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      {pending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      Delete user
                    </button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {userName}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the login (email/password and sessions) and releases
                      its timetable name so it can be re-claimed. The staff profile is kept
                      (detached) to preserve attendance, referral, substitution and message history.
                      This cannot be undone. If the account has its own admin activity (audit log,
                      resolved referrals, substitution plans) the deletion is refused.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
