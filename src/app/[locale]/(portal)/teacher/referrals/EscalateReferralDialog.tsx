"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowUpRight, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  referralId: string;
  referralStudentIds: string[];
  studentNames: string[];
  /** e.g. «Παραπομπή στον/στη Διευθυντή/ντρια» */
  label: string;
}

// Refer students up a level with a reason — one-way: the next level decides.
export function EscalateReferralDialog({ referralId, referralStudentIds, studentNames, label }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const { mutate: escalate, isPending } = trpc.referrals.escalate.useMutation({
    onSuccess: () => {
      toast.success("Η καταγγελία παραπέμφθηκε");
      setOpen(false);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) { toast.error("Γράψτε τον λόγο της παραπομπής"); return; }
    escalate({ referralId, referralStudentIds, reason: reason.trim() });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-xs font-medium text-orange-700 hover:bg-orange-100 touch-manipulation"
      >
        <ArrowUpRight className="w-3.5 h-3.5" />
        {label}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{label}</h3>
            <p className="text-base font-semibold text-emerald-700 mt-0.5">{studentNames.join(", ")}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)}
            className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Η απόφαση περνά στο επόμενο επίπεδο και δεν επιστρέφει. Θα ειδοποιηθεί όποιος/α αποφασίζει εκεί.
        </p>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700">Λόγος παραπομπής *</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="π.χ. Σοβαρό παράπτωμα — απαιτείται αποβολή πέραν των 2 ημερών"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Άκυρο</Button>
          <Button type="submit" disabled={isPending} className="bg-orange-600 hover:bg-orange-700">
            {isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Παραπομπή
          </Button>
        </div>
      </form>
    </div>
  );
}
