"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronRight, Loader2, X, Printer, MessageSquare, CheckCircle2, Plus, CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { totalPeriodsForDays } from "@/lib/periods";

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
  periodsConfig?: Record<number, number>; // DOW 1-5 → period count
}

// Total school periods across selected expulsion dates
function calcPeriods(dates: string[], periodsConfig: Record<number, number>): number {
  return totalPeriodsForDays(periodsConfig, dates);
}

// Local today as a YYYY-MM-DD string — earliest allowed expulsion day.
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("el-GR", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function defaultSmsMessage(studentNames: string[], expulsionDays: string[]): string {
  const names = studentNames.join(", ");
  if (expulsionDays.length > 0) {
    const fmtted = expulsionDays.map(fmtDate).join(", ");
    return `Αξιότιμε κηδεμόνα, ο/η ${names} αποβλήθηκε από το σχολείο τις ημερομηνίες: ${fmtted}, λόγω πειθαρχικού παραπτώματος. Για πληροφορίες επικοινωνήστε με τη Διεύθυνση.`;
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
  periodsConfig = { 1: 7, 2: 7, 3: 7, 4: 7, 5: 7 },
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState(false);

  // Form state
  const [action, setAction] = useState<Action>("PEDAGOGICAL_DIALOGUE");
  const [notes, setNotes] = useState("");
  const [counselorNotes, setCounselorNotes] = useState("");
  const [expulsionDays, setExpulsionDays] = useState<string[]>([]);
  const [dateInput, setDateInput] = useState("");
  const [parentContacted, setParentContacted] = useState(false);
  const [parentContactDate, setParentContactDate] = useState("");
  const [parentContactMethod, setParentContactMethod] = useState("");

  // SMS state
  const [smsMessage, setSmsMessage] = useState("");
  const [showSmsPanel, setShowSmsPanel] = useState(false);

  const totalPeriods = useMemo(
    () => calcPeriods(expulsionDays, periodsConfig),
    [expulsionDays, periodsConfig]
  );

  const minDay = todayIso();

  const addDay = () => {
    if (!dateInput) return;
    if (dateInput < minDay) { toast.error("Δεν επιτρέπονται ημερομηνίες στο παρελθόν"); return; }
    const dow = new Date(dateInput + "T12:00:00").getDay();
    if (dow === 0 || dow === 6) { toast.error("Το Σαββατοκύριακο δεν μετράει σε σχολικές μέρες"); return; }
    setExpulsionDays((prev) => prev.includes(dateInput) ? prev : [...prev, dateInput].sort());
    setDateInput("");
  };

  const removeDay = (d: string) => setExpulsionDays((prev) => prev.filter((x) => x !== d));

  const { mutate: resolve, isPending: resolving } = trpc.referrals.resolve.useMutation({
    onSuccess: () => {
      setResolved(true);
      setSmsMessage(defaultSmsMessage(studentNames, expulsionDays));
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
      setShowSmsPanel(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resolve({
      referralId,
      referralStudentId,
      action,
      notes: notes || undefined,
      counselorNotes: counselorNotes || undefined,
      expulsionDays: action === "DETENTION" ? expulsionDays : undefined,
      parentContacted,
      parentContactDate: parentContactDate || undefined,
      parentContactMethod: parentContactMethod || undefined,
    });
  };

  const handlePrint = () => window.open(`/${locale}/teacher/referrals/${referralId}/print?auto=1`, "_blank");

  const studentLabel = studentNames.length === 1 ? studentNames[0]! : `${studentNames.length} μαθητές`;

  // ─── Trigger buttons ──────────────────────────────────────────────────────
  if (!open) {
    if (groupResolve) return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] transition-all touch-manipulation">
        <span className="text-sm font-semibold text-white">Επίλυση Ομαδικά ({studentNames.length} μαθητές)</span>
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </button>
    );
    if (referralStudentId) return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 active:scale-[0.98] transition-all touch-manipulation">
        <span className="text-sm font-semibold text-slate-800">{studentLabel}</span>
        <span className="flex items-center gap-1 text-emerald-700 font-semibold text-sm">Επίλυση <ChevronRight className="w-4 h-4" /></span>
      </button>
    );
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

          {/* ── POST-RESOLVE ── */}
          {resolved ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-sm font-medium">Η απόφαση καταχωρήθηκε επιτυχώς</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={handlePrint}
                  className="flex flex-col items-center gap-2 px-4 py-5 rounded-2xl border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors touch-manipulation">
                  <Printer className="w-7 h-7 text-slate-600" />
                  <span className="text-sm font-semibold text-slate-700">Εκτύπωση</span>
                  <span className="text-xs text-slate-400">Απόφαση παραπτώματος</span>
                </button>
                <button onClick={() => setShowSmsPanel((v) => !v)}
                  className="flex flex-col items-center gap-2 px-4 py-5 rounded-2xl border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors touch-manipulation">
                  <MessageSquare className="w-7 h-7 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-700">Αποστολή SMS</span>
                  <span className="text-xs text-slate-400">Ειδοποίηση γονέων</span>
                </button>
              </div>

              {showSmsPanel && (
                <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <label className="text-sm font-semibold text-emerald-800">Μήνυμα SMS</label>
                  <textarea value={smsMessage} onChange={(e) => setSmsMessage(e.target.value)} rows={4}
                    className="w-full px-3 py-2 rounded-xl border border-emerald-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none bg-white" />
                  <p className="text-xs text-slate-400">{smsMessage.length} χαρακτήρες</p>
                  <Button onClick={() => sendSms({ referralId, referralStudentId, message: smsMessage })}
                    disabled={smsPending || !smsMessage.trim()}
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold touch-manipulation">
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
                          onChange={() => { setAction(a.value); if (a.value !== "DETENTION") setExpulsionDays([]); }}
                          className="sr-only" />
                        <span className="text-sm font-medium">{a.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Expulsion days — multi-date picker for DETENTION */}
                {action === "DETENTION" && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-red-600" />
                      <label className="text-sm font-semibold text-red-800">Ημέρες Αποβολής</label>
                    </div>

                    {/* Add date */}
                    <div className="flex gap-2">
                      <input type="date" value={dateInput} min={minDay}
                        onChange={(e) => setDateInput(e.target.value)}
                        className="flex-1 h-10 px-3 rounded-xl border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white" />
                      <button type="button" onClick={addDay} disabled={!dateInput}
                        className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-40 touch-manipulation">
                        <Plus className="w-4 h-4" /> Προσθήκη
                      </button>
                    </div>

                    {/* Selected days list */}
                    {expulsionDays.length > 0 && (
                      <div className="space-y-1.5">
                        {expulsionDays.map((d) => {
                          const dow = new Date(d + "T12:00:00").getDay();
                          const periods = periodsConfig[dow] ?? 7;
                          return (
                            <div key={d} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-red-200">
                              <div>
                                <span className="text-sm font-medium text-red-900">{fmtDate(d)}</span>
                                <span className="ml-2 text-xs text-red-500">{periods} ώρες</span>
                              </div>
                              <button type="button" onClick={() => removeDay(d)}
                                className="text-red-400 hover:text-red-700 p-1 touch-manipulation">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Summary */}
                    {expulsionDays.length > 0 && (
                      <div className="flex items-center justify-between pt-1 border-t border-red-200 text-sm">
                        <span className="font-semibold text-red-800">Σύνολο</span>
                        <span className="font-bold text-red-900">
                          {expulsionDays.length} ημέρ{expulsionDays.length === 1 ? "α" : "ες"} · {totalPeriods} ώρ{totalPeriods === 1 ? "α" : "ες"}
                        </span>
                      </div>
                    )}
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
