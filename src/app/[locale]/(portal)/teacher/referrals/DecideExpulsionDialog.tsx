"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronRight, Gavel, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  referralId: string;
  referralStudentIds: string[];
  studentNames: string[];
  /** The level's limit: 4 (headmaster) or 6 («Πειθαρχικό Συμβούλιο»). */
  maxDays: number;
  /** The filing teacher's recommendations, for context. */
  recommendation?: string | null;
}

/**
 * The headmaster / «Πειθαρχικό Συμβούλιο» decide a referred student: always an
 * expulsion — they set only its days. The homegroup headteacher then picks the
 * dates, writes the details, informs the parents and resolves it.
 */
export function DecideExpulsionDialog({ referralId, referralStudentIds, studentNames, maxDays, recommendation }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(1);
  const [notes, setNotes] = useState("");

  const { mutate: markOpened } = trpc.referrals.markOpened.useMutation();
  const { mutate: decide, isPending } = trpc.referrals.decide.useMutation({
    onSuccess: () => {
      toast.success("Η απόφαση στάλθηκε στον/στη Β.Δ. του τμήματος για εκτέλεση");
      setOpen(false);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const label = studentNames.length === 1 ? studentNames[0]! : `${studentNames.length} μαθητές`;

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); markOpened({ referralId }); }}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-red-50 border border-red-200 hover:bg-red-100 active:scale-[0.98] transition-all touch-manipulation"
      >
        <span className="text-sm font-semibold text-slate-800">{studentNames.length > 1 ? `Ομαδικά (${label})` : label}</span>
        <span className="flex items-center gap-1 text-red-700 font-semibold text-sm">Αποβολή <ChevronRight className="w-4 h-4" /></span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          decide({ referralId, referralStudentIds, days, notes: notes.trim() || undefined });
        }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Gavel className="w-5 h-5" /> Απόφαση αποβολής</h3>
            <p className="text-base font-semibold text-emerald-700 mt-0.5">{label}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)}
            className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>

        {recommendation && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">Εισήγηση εκπαιδευτικού: </span>{recommendation}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Ημέρες αποβολής (έως {maxDays})</label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: maxDays }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" onClick={() => setDays(n)}
                className={`h-11 w-11 rounded-xl border text-base font-semibold touch-manipulation ${
                  days === n ? "bg-red-600 border-red-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"
                }`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700">Σημειώσεις για τον/τη Β.Δ. (προαιρετικά)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
        </div>

        <p className="text-xs text-slate-500">
          Ο/Η Β.Δ. του τμήματος ορίζει τις ημερομηνίες, γράφει την περιγραφή, ενημερώνει τους γονείς και ολοκληρώνει την επίλυση.
        </p>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-12 px-5 rounded-xl">Ακύρωση</Button>
          <Button type="submit" disabled={isPending} className="flex-1 h-12 rounded-xl font-semibold bg-red-600 hover:bg-red-700 text-white">
            {isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            Αποβολή {days} {days === 1 ? "ημέρας" : "ημερών"}
          </Button>
        </div>
      </form>
    </div>
  );
}
