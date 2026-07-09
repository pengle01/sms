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
import { ShieldCheck, ShieldOff, HeartHandshake, ArrowLeftRight, Award, Loader2 } from "lucide-react";
import { grantSuperAdmin, revokeSuperAdmin, setSpecialEducation, setSubstitutionCoordinator, setDdkCoordinator } from "./actions";

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
        toast.error(res.error ?? "Κάτι πήγε στραβά");
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
    adminControl = <span className="text-xs font-medium text-purple-600">Κύριος Υπερδιαχειριστής</span>;
    adminHint = "Ο κύριος ρόλος αυτού του λογαριασμού είναι Υπερδιαχειριστής.";
  } else if (isSelf) {
    adminControl = <span className="text-xs text-slate-400">—</span>;
    adminHint = "Δεν μπορείτε να αλλάξετε τη δική σας πρόσβαση.";
  } else if (hasAdminGrant) {
    adminHint = "Έχει πλήρη πρόσβαση διαχείρισης συστήματος επιπλέον του κανονικού του ρόλου.";
    adminControl = isLastSuperAdmin ? (
      <span className="text-xs text-amber-600">Τελευταίος διαχειριστής — δεν είναι δυνατή η ανάκληση</span>
    ) : (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <button
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
              Ανάκληση πρόσβασης διαχειριστή
            </button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ανάκληση πρόσβασης διαχειριστή;</AlertDialogTitle>
            <AlertDialogDescription>
              Ο/Η {userName} θα χάσει αμέσως την πρόσβαση στην πύλη διαχείρισης και σε όλες τις
              λειτουργίες διαχείρισης. Ο κανονικός ρόλος και οι λειτουργίες του δεν επηρεάζονται.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => revokeSuperAdmin(userId), "Η πρόσβαση διαχειριστή ανακλήθηκε")}>
              Ανάκληση
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  } else {
    adminHint = "Παραχωρεί πλήρη διαχείριση συστήματος επιπλέον του κανονικού του ρόλου.";
    adminControl = (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <button
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Παραχώρηση πρόσβασης διαχειριστή
            </button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Παραχώρηση πρόσβασης διαχειριστή;</AlertDialogTitle>
            <AlertDialogDescription>
              Ο/Η {userName} θα αποκτήσει ΠΛΗΡΗ πρόσβαση διαχείρισης συστήματος — όλα τα δεδομένα
              μαθητών, τις ρυθμίσεις, τη διαχείριση χρηστών και τα αρχεία καταγραφής — διατηρώντας
              τον τρέχοντα ρόλο και την πύλη του. Η αλλαγή ισχύει αμέσως και καταγράφεται στο
              αρχείο καταγραφής.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => grantSuperAdmin(userId), "Παραχωρήθηκε πρόσβαση διαχειριστή")}>
              Παραχώρηση πρόσβασης
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // ── Special education designation ───────────────────────────────────────
  const specialEdControl = !hasStaffProfile ? (
    <span className="text-xs text-slate-400">Χωρίς προφίλ προσωπικού</span>
  ) : (
    <button
      disabled={pending}
      onClick={() =>
        run(
          () => setSpecialEducation(userId, !specialEducation),
          specialEducation ? "Η ιδιότητα αφαιρέθηκε" : "Η ιδιότητα ορίστηκε"
        )
      }
      className={
        specialEducation
          ? "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 disabled:opacity-50"
          : "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      }
    >
      <HeartHandshake className="w-3.5 h-3.5" />
      {specialEducation ? "Ειδική Εκπαίδευση ✓" : "Ορισμός ως υπεύθυνος Ειδικής Αγωγής"}
    </button>
  );

  // ── Substitution coordinator designation ─────────────────────────────────
  const coordinatorControl = !hasStaffProfile ? (
    <span className="text-xs text-slate-400">Χωρίς προφίλ προσωπικού</span>
  ) : (
    <button
      disabled={pending}
      onClick={() =>
        run(
          () => setSubstitutionCoordinator(userId, !substitutionCoordinator),
          substitutionCoordinator ? "Η ιδιότητα αφαιρέθηκε" : "Η ιδιότητα ορίστηκε"
        )
      }
      className={
        substitutionCoordinator
          ? "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700 disabled:opacity-50"
          : "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      }
    >
      <ArrowLeftRight className="w-3.5 h-3.5" />
      {substitutionCoordinator ? "Αναπληρώσεις ✓" : "Ορισμός ως συντονιστής αναπληρώσεων"}
    </button>
  );

  // ── ΔΔΚ coordinator designation ───────────────────────────────────────────
  const ddkControl = !hasStaffProfile ? (
    <span className="text-xs text-slate-400">Χωρίς προφίλ προσωπικού</span>
  ) : (
    <button
      disabled={pending}
      onClick={() =>
        run(
          () => setDdkCoordinator(userId, !ddkCoordinator),
          ddkCoordinator ? "Η ιδιότητα αφαιρέθηκε" : "Η ιδιότητα ορίστηκε"
        )
      }
      className={
        ddkCoordinator
          ? "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50"
          : "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      }
    >
      <Award className="w-3.5 h-3.5" />
      {ddkCoordinator ? "ΔΔΚ ✓" : "Ορισμός ως συντονιστής ΔΔΚ"}
    </button>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Ρόλοι & Ιδιότητες
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-slate-50">
        {row("Διαχειριστής συστήματος", adminControl, adminHint)}
        {row(
          "Ειδική Αγωγή (Βοηθός Διευθυντής)",
          specialEdControl,
          "Βοηθός Διευθυντής υπεύθυνος για την Ειδική Αγωγή."
        )}
        {row(
          "Συντονιστής Αναπληρώσεων",
          coordinatorControl,
          "Διαχειρίζεται το ημερήσιο πλάνο αναπληρώσεων: το δημιουργεί, το ελέγχει και το οριστικοποιεί."
        )}
        {row(
          "Συντονιστής ΔΔΚ (Δημιουργικότητα-Δράση-Κοινωνική Προσφορά)",
          ddkControl,
          "Ελέγχει τους πόντους ΔΔΚ των μαθητών και εκτυπώνει τις αναφορές τέλους χρονιάς."
        )}
      </CardContent>
    </Card>
  );
}
