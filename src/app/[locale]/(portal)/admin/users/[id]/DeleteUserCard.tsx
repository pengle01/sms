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
    ? "Δεν μπορείτε να διαγράψετε τον δικό σας λογαριασμό."
    : isLastAdmin
      ? "Τελευταίος διαχειριστής — δεν είναι δυνατή η διαγραφή."
      : null;

  function onConfirm() {
    startTransition(async () => {
      const res = await deleteUser(userId);
      if (res.ok) {
        toast.success("Ο χρήστης διαγράφηκε");
        router.push(`/${locale}/admin/users`);
      } else {
        toast.error(res.error ?? "Κάτι πήγε στραβά");
      }
    });
  }

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-red-700">
          <TriangleAlert className="w-4 h-4" />
          Επικίνδυνη ζώνη
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Διαγραφή αυτού του χρήστη</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Αφαιρεί οριστικά τη σύνδεση και αποδεσμεύει το όνομα προγράμματος ώστε άλλο πρόσωπο να
              μπορεί να διεκδικήσει τον ρόλο. Το προφίλ προσωπικού διατηρείται (αποσυνδεδεμένο) ώστε
              να μη χαθεί το ιστορικό παρουσιών, παραπομπών, αναπληρώσεων και μηνυμάτων. Λογαριασμός
              με δική του διαχειριστική δραστηριότητα (αρχείο καταγραφής, διεκπεραιωμένες παραπομπές,
              πλάνα αναπληρώσεων) δεν μπορεί να διαγραφεί.
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
                      Διαγραφή χρήστη
                    </button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Διαγραφή {userName};</AlertDialogTitle>
                    <AlertDialogDescription>
                      Διαγράφει οριστικά τη σύνδεση (email/κωδικός και συνεδρίες) και αποδεσμεύει το
                      όνομα προγράμματος ώστε να μπορεί να διεκδικηθεί ξανά. Το προφίλ προσωπικού
                      διατηρείται (αποσυνδεδεμένο) για να μη χαθεί το ιστορικό παρουσιών, παραπομπών,
                      αναπληρώσεων και μηνυμάτων. Η ενέργεια δεν αναιρείται. Αν ο λογαριασμός έχει
                      δική του διαχειριστική δραστηριότητα (αρχείο καταγραφής, διεκπεραιωμένες
                      παραπομπές, πλάνα αναπληρώσεων), η διαγραφή απορρίπτεται.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Άκυρο</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Διαγραφή</AlertDialogAction>
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
