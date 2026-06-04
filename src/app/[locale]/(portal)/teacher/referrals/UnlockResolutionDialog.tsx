"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, LockOpen, X, Hourglass } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  resolutionId: string;
  studentName: string;
  /** Current decision shown for context (e.g. "Αποβολή · 2 ημέρες"). */
  currentSummary: string;
  /** An unlock request is already awaiting an admin decision. */
  hasPendingUnlock?: boolean;
}

// Ask the admin to unlock a completed resolution. Approval deletes the
// decision and the referral moves back to the examine tab to be redone.
export function UnlockResolutionDialog({ resolutionId, studentName, currentSummary, hasPendingUnlock = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const { mutate: requestUnlock, isPending } = trpc.referrals.requestResolutionUnlock.useMutation({
    onSuccess: () => {
      toast.success("Το αίτημα ξεκλειδώματος στάλθηκε στη Διαχείριση");
      setOpen(false);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) { toast.error("Αιτιολογήστε το ξεκλείδωμα"); return; }
    requestUnlock({ resolutionId, reason: reason.trim() });
  };

  if (hasPendingUnlock) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
        <Hourglass className="w-3 h-3" />
        Εκκρεμεί ξεκλείδωμα
      </span>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 touch-manipulation"
      >
        <LockOpen className="w-3 h-3" />
        Ξεκλείδωμα
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Αίτημα Ξεκλειδώματος</h3>
              <p className="text-base font-semibold text-emerald-700 mt-0.5">{studentName}</p>
            </div>
            <button onClick={() => setOpen(false)}
              className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 touch-manipulation">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <span className="font-semibold">Τρέχουσα απόφαση: </span>
            {currentSummary}
          </div>

          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
            Με την έγκριση του ξεκλειδώματος η απόφαση διαγράφεται και η
            καταγγελία επιστρέφει στις εκκρεμείς για νέα επίλυση.
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Αιτιολόγηση *</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                required
                placeholder="Γιατί χρειάζεται το ξεκλείδωμα…"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
            </div>

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline"
                onClick={() => setOpen(false)} className="h-11 px-5 rounded-xl">
                Ακύρωση
              </Button>
              <Button type="submit" disabled={isPending}
                className="flex-1 h-11 rounded-xl font-semibold bg-slate-800 hover:bg-slate-700 text-white touch-manipulation">
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Αποστολή για Έγκριση
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
