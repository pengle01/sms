"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Hourglass, Loader2, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  referralStudentId: string;
  studentName: string;
  /** A request already awaits the admin. */
  pending: boolean;
}

// The headmaster: a student referred to them by mistake goes back to the
// homegroup headteacher — once the admin approves.
export function ReturnReferralDialog({ referralStudentId, studentName, pending }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const { mutate, isPending } = trpc.referrals.requestReturn.useMutation({
    onSuccess: () => {
      toast.success("Το αίτημα στάλθηκε στη Διαχείριση για έγκριση");
      setOpen(false);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
        <Hourglass className="w-3 h-3" />
        Εκκρεμεί έγκριση ακύρωσης παραπομπής
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 touch-manipulation"
      >
        <Undo2 className="w-3.5 h-3.5" />
        Ακύρωση παραπομπής — επιστροφή στον/στη Β.Δ.
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim().length < 5) { toast.error("Γράψτε τον λόγο"); return; }
          mutate({ referralStudentId, reason: reason.trim() });
        }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Ακύρωση παραπομπής</h3>
            <p className="text-base font-semibold text-emerald-700 mt-0.5">{studentName}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)}
            className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Με την έγκριση της Διαχείρισης, ο/η μαθητής/τρια επιστρέφει στον/στη Β.Δ. του τμήματος, που αποφασίζει όπως πριν.
        </p>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700">Λόγος *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            placeholder="π.χ. Παραπέμφθηκε κατά λάθος"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Άκυρο</Button>
          <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Αποστολή αιτήματος
          </Button>
        </div>
      </form>
    </div>
  );
}
