"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";

const ACTIONS = [
  { value: "PEDAGOGICAL_DIALOGUE", label: "Παιδαγωγικός Διάλογος" },
  { value: "WRITTEN_AGREEMENT", label: "Γραπτή Συμφωνία" },
  { value: "WARNING", label: "Προειδοποίηση" },
  { value: "DETENTION", label: "Αποβολή" },
  { value: "OTHER", label: "Άλλο" },
] as const;

type Action = (typeof ACTIONS)[number]["value"];

interface Props {
  referralId: string;
  studentNames: string[];
  recommendation?: string;
  canViewCounselorNotes?: boolean;
}

export function ResolveReferralDialog({
  referralId,
  studentNames,
  recommendation,
  canViewCounselorNotes = false,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action>("PEDAGOGICAL_DIALOGUE");
  const [notes, setNotes] = useState("");
  const [counselorNotes, setCounselorNotes] = useState("");
  const [parentContacted, setParentContacted] = useState(false);
  const [parentContactDate, setParentContactDate] = useState("");
  const [parentContactMethod, setParentContactMethod] = useState("");

  const { mutate, isPending } = trpc.referrals.resolve.useMutation({
    onSuccess: () => {
      toast.success("Η καταγγελία επιλύθηκε");
      setOpen(false);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutate({
      referralId,
      action,
      notes: notes || undefined,
      counselorNotes: counselorNotes || undefined,
      parentContacted,
      parentContactDate: parentContactDate || undefined,
      parentContactMethod: parentContactMethod || undefined,
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        Επίλυση
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Επίλυση Καταγγελίας</h3>
            <p className="text-sm text-slate-500">
              {studentNames.length === 1
                ? studentNames[0]
                : `${studentNames.length} μαθητές: ${studentNames.join(", ")}`}
            </p>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {recommendation && recommendation !== "NO_RECOMMENDATION" && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            <span className="font-semibold">Εισήγηση εκπαιδευτικού: </span>
            {recommendation.replace(/_/g, " ")}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Ενέργεια που ελήφθη</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as Action)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Σημειώσεις (προαιρετικά)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {canViewCounselorNotes && (
            <div className="space-y-1.5 rounded-lg bg-purple-50 border border-purple-100 p-3">
              <label className="text-sm font-medium text-purple-800">
                Ιδιωτικές Σημειώσεις Συμβούλου
              </label>
              <textarea
                value={counselorNotes}
                onChange={(e) => setCounselorNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none bg-white"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              id="parentContacted"
              type="checkbox"
              checked={parentContacted}
              onChange={(e) => setParentContacted(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="parentContacted" className="text-sm text-slate-700">
              Ειδοποιήθηκε γονέας/κηδεμόνας
            </label>
          </div>

          {parentContacted && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Ημερ. επικοινωνίας</label>
                <input
                  type="date"
                  value={parentContactDate}
                  onChange={(e) => setParentContactDate(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Μέσο</label>
                <input
                  type="text"
                  value={parentContactMethod}
                  onChange={(e) => setParentContactMethod(e.target.value)}
                  placeholder="Τηλέφωνο, email…"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-9 px-4">
              Ακύρωση
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="h-9 px-4 bg-green-600 hover:bg-green-700 text-white"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Επίλυση
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
