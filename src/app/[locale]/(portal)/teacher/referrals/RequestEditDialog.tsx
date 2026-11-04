"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Hourglass, Loader2, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  referralId: string;
  number: number;
  /** A request already awaits the admin. */
  pending: boolean;
}

// Ask the admin to return a filed referral to the drafts, to edit and file it
// again — even after a headteacher has opened it. Decisions already taken stay.
export function RequestEditDialog({ referralId, number, pending }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const { mutate, isPending } = trpc.referrals.requestEdit.useMutation({
    onSuccess: () => {
      toast.success("Το αίτημα τροποποίησης στάλθηκε στη Διαχείριση");
      setOpen(false);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
        <Hourglass className="w-3 h-3" />
        Εκκρεμεί έγκριση τροποποίησης
      </span>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 touch-manipulation"
      >
        <Pencil className="w-3 h-3" />
        Αίτημα τροποποίησης
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim().length < 5) { toast.error("Γράψτε τον λόγο της τροποποίησης"); return; }
          mutate({ referralId, reason: reason.trim() });
        }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-900">Αίτημα τροποποίησης — καταγγελία #{number}</h3>
          <button type="button" onClick={() => setOpen(false)}
            className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Με την έγκριση της Διαχείρισης, η καταγγελία επιστρέφει στα πρόχειρά σας για να τη διορθώσετε και να την υποβάλετε ξανά.
          Οι αποφάσεις που έχουν ήδη ληφθεί παραμένουν.
        </p>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700">Τι χρειάζεται να αλλάξει; *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
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
