"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronRight, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";

const ACTIONS = [
  { value: "PEDAGOGICAL_DIALOGUE", label: "Παιδαγωγικός Διάλογος" },
  { value: "WRITTEN_AGREEMENT",    label: "Γραπτή Συμφωνία" },
  { value: "WARNING",              label: "Προειδοποίηση" },
  { value: "DETENTION",            label: "Αποβολή" },
  { value: "OTHER",                label: "Άλλο" },
] as const;

type Action = (typeof ACTIONS)[number]["value"];

interface Props {
  referralId: string;
  referralStudentId?: string; // if set, resolves only this student
  studentNames: string[];
  recommendation?: string;
  canViewCounselorNotes?: boolean;
  groupResolve?: boolean; // renders as a prominent "resolve all" button
}

export function ResolveReferralDialog({
  referralId,
  referralStudentId,
  studentNames,
  recommendation,
  canViewCounselorNotes = false,
  groupResolve = false,
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
      referralStudentId,
      action,
      notes: notes || undefined,
      counselorNotes: counselorNotes || undefined,
      parentContacted,
      parentContactDate: parentContactDate || undefined,
      parentContactMethod: parentContactMethod || undefined,
    });
  };

  const studentLabel =
    studentNames.length === 1
      ? studentNames[0]!
      : `${studentNames.length} μαθητές`;

  if (!open) {
    if (groupResolve) {
      // Collective punishment button — slate background, spans full width
      return (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] transition-all touch-manipulation"
        >
          <span className="text-sm font-semibold text-white">
            Επίλυση Ομαδικά ({studentNames.length} μαθητές)
          </span>
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </button>
      );
    }
    if (referralStudentId) {
      // Per-student: big accessible row button
      return (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 active:scale-[0.98] transition-all touch-manipulation"
        >
          <span className="text-sm font-semibold text-slate-800">{studentLabel}</span>
          <span className="flex items-center gap-1 text-emerald-700 font-semibold text-sm">
            Επίλυση
            <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      );
    }
    // All-students fallback (management view)
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-medium text-sm touch-manipulation"
      >
        Επίλυση όλων
        <ChevronRight className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Επίλυση Καταγγελίας</h3>
            <p className="text-base font-semibold text-emerald-700 mt-0.5">{studentLabel}</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {recommendation && recommendation !== "NO_RECOMMENDATION" && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">Εισήγηση εκπαιδευτικού: </span>
            {recommendation.replace(/_/g, " ")}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Action */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Ενέργεια που ελήφθη</label>
            <div className="grid grid-cols-1 gap-2">
              {ACTIONS.map((a) => (
                <label
                  key={a.value}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors touch-manipulation ${
                    action === a.value
                      ? "bg-slate-800 border-slate-800 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="action"
                    value={a.value}
                    checked={action === a.value}
                    onChange={() => setAction(a.value)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{a.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Σημειώσεις (προαιρετικά)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Counselor notes */}
          {canViewCounselorNotes && (
            <div className="space-y-1.5 rounded-xl bg-purple-50 border border-purple-100 p-4">
              <label className="text-sm font-semibold text-purple-800">
                Ιδιωτικές Σημειώσεις Συμβούλου
              </label>
              <textarea
                value={counselorNotes}
                onChange={(e) => setCounselorNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none bg-white"
              />
            </div>
          )}

          {/* Parent contact */}
          <label className="flex items-center gap-3 cursor-pointer touch-manipulation">
            <input
              type="checkbox"
              checked={parentContacted}
              onChange={(e) => setParentContacted(e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm font-medium text-slate-700">Ειδοποιήθηκε γονέας/κηδεμόνας</span>
          </label>

          {parentContacted && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Ημερ. επικοινωνίας</label>
                <input
                  type="date"
                  value={parentContactDate}
                  onChange={(e) => setParentContactDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Μέσο</label>
                <input
                  type="text"
                  value={parentContactMethod}
                  onChange={(e) => setParentContactMethod(e.target.value)}
                  placeholder="Τηλέφωνο, email…"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="h-12 px-5 rounded-xl text-base"
            >
              Ακύρωση
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1 h-12 rounded-xl text-base font-semibold bg-green-600 hover:bg-green-700 text-white touch-manipulation"
            >
              {isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              Επίλυση
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
