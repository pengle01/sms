"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronRight, Loader2, X, Printer, MessageSquare, CheckCircle2 } from "lucide-react";
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
  referralStudentId?: string;
  studentNames: string[];
  recommendation?: string;
  canViewCounselorNotes?: boolean;
  groupResolve?: boolean;
  locale?: string;
}

function defaultSmsMessage(studentNames: string[], startDate?: string, endDate?: string): string {
  const names = studentNames.join(", ");
  if (startDate) {
    const start = new Date(startDate).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const end = endDate ? new Date(endDate).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" }) : start;
    return `Αξιότιμε κηδεμόνα, ο/η ${names} αποβλήθηκε από το σχολείο από ${start} έως ${end} λόγω πειθαρχικού παραπτώματος. Για πληροφορίες επικοινωνήστε με τη Διεύθυνση.`;
  }
  return `Αξιότιμε κηδεμόνα, το πειθαρχικό θέμα του/της ${names} εξετάστηκε και ελήφθη απόφαση. Για πληροφορίες επικοινωνήστε με τη Διεύθυνση.`;
}

export function ResolveReferralDialog({
  referralId,
  referralStudentId,
  studentNames,
  recommendation,
  canViewCounselorNotes = false,
  groupResolve = false,
  locale = "el",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState(false);

  // Form state
  const [action, setAction] = useState<Action>("PEDAGOGICAL_DIALOGUE");
  const [notes, setNotes] = useState("");
  const [counselorNotes, setCounselorNotes] = useState("");
  const [expulsionStartDate, setExpulsionStartDate] = useState("");
  const [expulsionEndDate, setExpulsionEndDate] = useState("");
  const [parentContacted, setParentContacted] = useState(false);
  const [parentContactDate, setParentContactDate] = useState("");
  const [parentContactMethod, setParentContactMethod] = useState("");

  // SMS state
  const [sendingSms, setSendingSms] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [showSmsPanel, setShowSmsPanel] = useState(false);

  const { mutate: resolve, isPending: resolving } = trpc.referrals.resolve.useMutation({
    onSuccess: () => {
      setResolved(true);
      setSmsMessage(defaultSmsMessage(studentNames, expulsionStartDate, expulsionEndDate));
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const { mutate: sendSms, isPending: smsPending } = trpc.referrals.sendResolutionSms.useMutation({
    onSuccess: (data) => {
      const sent = data.results.filter((r) => r.success).length;
      const failed = data.results.filter((r) => !r.success).length;
      if (sent > 0) toast.success(`SMS εστάλη σε ${sent} επαφή/ές`);
      if (failed > 0) toast.error(`${failed} αποστολή/ές απέτυχαν`);
      setSendingSms(false);
      setShowSmsPanel(false);
    },
    onError: (e) => { toast.error(e.message); setSendingSms(false); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resolve({
      referralId,
      referralStudentId,
      action,
      notes: notes || undefined,
      counselorNotes: counselorNotes || undefined,
      expulsionStartDate: action === "DETENTION" ? expulsionStartDate || undefined : undefined,
      expulsionEndDate: action === "DETENTION" ? expulsionEndDate || undefined : undefined,
      parentContacted,
      parentContactDate: parentContactDate || undefined,
      parentContactMethod: parentContactMethod || undefined,
    });
  };

  const handlePrint = () => {
    window.open(`/${locale}/teacher/referrals/${referralId}/print?auto=1`, "_blank");
  };

  const handleSendSms = () => {
    if (!smsMessage.trim()) return;
    setSendingSms(true);
    sendSms({ referralId, referralStudentId, message: smsMessage });
  };

  const studentLabel = studentNames.length === 1 ? studentNames[0]! : `${studentNames.length} μαθητές`;

  // ─── Trigger buttons ───────────────────────────────────────────────────────
  if (!open) {
    if (groupResolve) {
      return (
        <button onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] transition-all touch-manipulation">
          <span className="text-sm font-semibold text-white">Επίλυση Ομαδικά ({studentNames.length} μαθητές)</span>
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </button>
      );
    }
    if (referralStudentId) {
      return (
        <button onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 active:scale-[0.98] transition-all touch-manipulation">
          <span className="text-sm font-semibold text-slate-800">{studentLabel}</span>
          <span className="flex items-center gap-1 text-emerald-700 font-semibold text-sm">
            Επίλυση <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      );
    }
    return (
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-medium text-sm touch-manipulation">
        Επίλυση όλων <ChevronRight className="w-4 h-4" />
      </button>
    );
  }

  // ─── Dialog ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {resolved ? "Αποφάσεις Επίλυσης" : "Επίλυση Καταγγελίας"}
              </h3>
              <p className="text-base font-semibold text-emerald-700 mt-0.5">{studentLabel}</p>
            </div>
            <button onClick={() => { setOpen(false); setResolved(false); }}
              className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 touch-manipulation">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── POST-RESOLVE STATE ── */}
          {resolved ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-sm font-medium">Η απόφαση καταχωρήθηκε επιτυχώς</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Print button */}
                <button onClick={handlePrint}
                  className="flex flex-col items-center gap-2 px-4 py-5 rounded-2xl border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors touch-manipulation">
                  <Printer className="w-7 h-7 text-slate-600" />
                  <span className="text-sm font-semibold text-slate-700">Εκτύπωση</span>
                  <span className="text-xs text-slate-400">Απόφαση παραπτώματος</span>
                </button>

                {/* SMS button */}
                <button onClick={() => setShowSmsPanel((v) => !v)}
                  className="flex flex-col items-center gap-2 px-4 py-5 rounded-2xl border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors touch-manipulation">
                  <MessageSquare className="w-7 h-7 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-700">Αποστολή SMS</span>
                  <span className="text-xs text-slate-400">Ειδοποίηση γονέων</span>
                </button>
              </div>

              {/* SMS compose panel */}
              {showSmsPanel && (
                <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <label className="text-sm font-semibold text-emerald-800">Μήνυμα SMS</label>
                  <textarea
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 rounded-xl border border-emerald-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none bg-white"
                  />
                  <p className="text-xs text-slate-400">{smsMessage.length} χαρακτήρες</p>
                  <Button
                    onClick={handleSendSms}
                    disabled={smsPending || !smsMessage.trim()}
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold touch-manipulation"
                  >
                    {smsPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Αποστολή SMS στους Γονείς
                  </Button>
                </div>
              )}

              <button onClick={() => { setOpen(false); setResolved(false); }}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 touch-manipulation">
                Κλείσιμο
              </button>
            </div>
          ) : (
            /* ── RESOLVE FORM ── */
            <>
              {recommendation && recommendation !== "NO_RECOMMENDATION" && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  <span className="font-semibold">Εισήγηση εκπαιδευτικού: </span>
                  {recommendation.replace(/_/g, " ")}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Action radio cards */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Ενέργεια που ελήφθη</label>
                  <div className="grid grid-cols-1 gap-2">
                    {ACTIONS.map((a) => (
                      <label key={a.value}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors touch-manipulation ${
                          action === a.value
                            ? "bg-slate-800 border-slate-800 text-white"
                            : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"
                        }`}>
                        <input type="radio" name="action" value={a.value}
                          checked={action === a.value}
                          onChange={() => setAction(a.value)}
                          className="sr-only" />
                        <span className="text-sm font-medium">{a.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Expulsion dates — shown only for DETENTION */}
                {action === "DETENTION" && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                    <label className="text-sm font-semibold text-red-800">Ημερομηνίες Αποβολής</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-red-700">Από</label>
                        <input type="date" value={expulsionStartDate}
                          onChange={(e) => setExpulsionStartDate(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-red-700">Έως</label>
                        <input type="date" value={expulsionEndDate}
                          onChange={(e) => setExpulsionEndDate(e.target.value)}
                          min={expulsionStartDate}
                          className="w-full h-10 px-3 rounded-xl border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Σημειώσεις (προαιρετικά)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                </div>

                {/* Counselor notes */}
                {canViewCounselorNotes && (
                  <div className="rounded-xl bg-purple-50 border border-purple-100 p-4 space-y-1.5">
                    <label className="text-sm font-semibold text-purple-800">Ιδιωτικές Σημειώσεις Συμβούλου</label>
                    <textarea value={counselorNotes} onChange={(e) => setCounselorNotes(e.target.value)} rows={2}
                      className="w-full px-3 py-2 rounded-xl border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none bg-white" />
                  </div>
                )}

                {/* Parent contact */}
                <label className="flex items-center gap-3 cursor-pointer touch-manipulation">
                  <input type="checkbox" checked={parentContacted}
                    onChange={(e) => setParentContacted(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  <span className="text-sm font-medium text-slate-700">Ειδοποιήθηκε γονέας/κηδεμόνας</span>
                </label>
                {parentContacted && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Ημερ. επικοινωνίας</label>
                      <input type="date" value={parentContactDate}
                        onChange={(e) => setParentContactDate(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Μέσο</label>
                      <input type="text" value={parentContactMethod}
                        onChange={(e) => setParentContactMethod(e.target.value)}
                        placeholder="Τηλέφωνο, email…"
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                  </div>
                )}

                {/* Submit */}
                <div className="flex gap-3 pt-1">
                  <Button type="button" variant="outline"
                    onClick={() => setOpen(false)} className="h-12 px-5 rounded-xl text-base">
                    Ακύρωση
                  </Button>
                  <Button type="submit" disabled={resolving}
                    className="flex-1 h-12 rounded-xl text-base font-semibold bg-green-600 hover:bg-green-700 text-white touch-manipulation">
                    {resolving && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                    Επίλυση
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
