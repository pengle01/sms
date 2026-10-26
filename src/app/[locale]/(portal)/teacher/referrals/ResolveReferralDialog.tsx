"use client";

import { useState, useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronRight, Loader2, X, Printer, MessageSquare, CheckCircle2, Plus, CalendarDays, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { totalPeriodsForDays, periodsForDow, isPartialDay } from "@/lib/periods";
import {
  recommendationsLabel,
  ACTION_ORDER,
  actionLabel,
  expulsionLength,
  lengthLabel,
  type ResolutionActionValue,
} from "@/lib/referralLabels";
import { SUSPENDED_MAX_DAYS, SUSPENDED_MAX_PERIODS } from "@/lib/punishment";

// The punishments in the dialog's order (Προειδοποίηση before Γραπτή Συμφωνία).
const ACTIONS = ACTION_ORDER.map((value) => ({ value, label: actionLabel(value) }));

type Action = ResolutionActionValue;

/** One expulsion day: the whole day (no range) or periods fromPeriod–toPeriod. */
type ExpulsionDay = { date: string; fromPeriod: number | null; toPeriod: number | null };

interface Props {
  referralId: string;
  referralStudentId?: string;
  studentNames: string[];
  /** The filing teacher's recommendations (empty = none). */
  recommendations?: string[];
  canViewCounselorNotes?: boolean;
  groupResolve?: boolean;
  locale?: string;
  periodsConfig?: Record<number, number>; // DOW 1-5 → period count
}

// Total school periods across the expulsion days (whole days and ranges)
function calcPeriods(days: ExpulsionDay[], periodsConfig: Record<number, number>): number {
  return totalPeriodsForDays(periodsConfig, days);
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
    weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

function defaultSmsMessage(
  studentNames: string[],
  action: Action,
  expulsionDays: ExpulsionDay[],
  suspended: { days: number; periods: number },
): string {
  const names = studentNames.join(", ");
  if (action === "DETENTION" && expulsionDays.length > 0) {
    const fmtted = expulsionDays
      .map((d) => (isPartialDay(d) ? `${fmtDate(d.date)} (περίοδοι ${d.fromPeriod}–${d.toPeriod})` : fmtDate(d.date)))
      .join(", ");
    return `Αξιότιμε κηδεμόνα, ο/η ${names} αποβλήθηκε από το σχολείο τις ημερομηνίες: ${fmtted}, λόγω πειθαρχικού παραπτώματος. Για πληροφορίες επικοινωνήστε με τη Διεύθυνση.`;
  }
  if (action === "SUSPENDED_EXPULSION") {
    return `Αξιότιμε κηδεμόνα, στον/στην ${names} επιβλήθηκε αποβολή με αναστολή (${lengthLabel(suspended.days, suspended.periods)}), λόγω πειθαρχικού παραπτώματος. Η αποβολή εκτίεται σε περίπτωση νέου παραπτώματος. Για πληροφορίες επικοινωνήστε με τη Διεύθυνση.`;
  }
  return `Αξιότιμε κηδεμόνα, το πειθαρχικό θέμα του/της ${names} εξετάστηκε και ελήφθη απόφαση. Για πληροφορίες επικοινωνήστε με τη Διεύθυνση.`;
}

export function ResolveReferralDialog({
  referralId,
  referralStudentId,
  studentNames,
  recommendations = [],
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
  const [actionDetails, setActionDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [counselorNotes, setCounselorNotes] = useState("");
  const [expulsionDays, setExpulsionDays] = useState<ExpulsionDay[]>([]);
  // «Αποβολή με Αναστολή»: its length, no dates
  const [suspendedDays, setSuspendedDays] = useState("");
  const [suspendedPeriods, setSuspendedPeriods] = useState("");
  const suspended = { days: parseInt(suspendedDays) || 0, periods: parseInt(suspendedPeriods) || 0 };
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
    setExpulsionDays((prev) =>
      prev.some((x) => x.date === dateInput)
        ? prev
        : [...prev, { date: dateInput, fromPeriod: null, toPeriod: null }].sort((a, b) => a.date.localeCompare(b.date)),
    );
    setDateInput("");
  };

  const removeDay = (d: string) => setExpulsionDays((prev) => prev.filter((x) => x.date !== d));
  // Whole day, or a period range (from ≤ to, kept within the day).
  const setDayRange = (d: string, fromPeriod: number | null, toPeriod: number | null) =>
    setExpulsionDays((prev) =>
      prev.map((x) =>
        x.date !== d
          ? x
          : fromPeriod === null || toPeriod === null
            ? { ...x, fromPeriod: null, toPeriod: null }
            : { ...x, fromPeriod: Math.min(fromPeriod, toPeriod), toPeriod: Math.max(fromPeriod, toPeriod) },
      ),
    );

  // Mark the referral opened (red → yellow) when a headteacher examines it.
  const { mutate: markOpened } = trpc.referrals.markOpened.useMutation({
    onSuccess: (res) => { if (res.changed) router.refresh(); },
  });

  const openDialog = () => {
    setOpen(true);
    markOpened({ referralId });
  };

  const { mutate: resolve, isPending: resolving } = trpc.referrals.resolve.useMutation({
    onSuccess: () => {
      setResolved(true);
      setSmsMessage(defaultSmsMessage(studentNames, action, expulsionDays, suspended));
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
    if (actionDetails.trim().length < 5) {
      toast.error("Περιγράψτε το παιδαγωγικό μέτρο (τουλάχιστον 5 χαρακτήρες)");
      return;
    }
    if (action === "DETENTION" && expulsionDays.length === 0) {
      toast.error("Επιλέξτε τουλάχιστον μία ημέρα αποβολής");
      return;
    }
    if (action === "SUSPENDED_EXPULSION" && suspended.days === 0 && suspended.periods === 0) {
      toast.error("Δώστε τη διάρκεια της αποβολής με αναστολή (ημέρες ή περιόδους)");
      return;
    }
    resolve({
      referralId,
      referralStudentId,
      action,
      actionDetails: actionDetails.trim(),
      notes: notes || undefined,
      counselorNotes: counselorNotes || undefined,
      expulsionDays: action === "DETENTION" ? expulsionDays : undefined,
      suspendedDays: action === "SUSPENDED_EXPULSION" ? suspended.days || null : undefined,
      suspendedPeriods: action === "SUSPENDED_EXPULSION" ? suspended.periods || null : undefined,
      parentContacted,
      parentContactDate: parentContactDate || undefined,
      parentContactMethod: parentContactMethod || undefined,
    });
  };

  const handlePrint = () => window.open(`/${locale}/teacher/referrals/${referralId}/print?auto=1`, "_blank");
  // The parent letter: just this student's, or every resolved one on a group resolve.
  const handleLetter = () =>
    window.open(
      `/${locale}/teacher/referrals/${referralId}/letter?auto=1${!groupResolve && referralStudentId ? `&student=${referralStudentId}` : ""}`,
      "_blank",
    );

  const studentLabel = studentNames.length === 1 ? studentNames[0]! : `${studentNames.length} μαθητές`;

  // ─── Trigger buttons ──────────────────────────────────────────────────────
  if (!open) {
    if (groupResolve) return (
      <button onClick={openDialog}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] transition-all touch-manipulation">
        <span className="text-sm font-semibold text-white">Επίλυση Ομαδικά ({studentNames.length} μαθητές)</span>
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </button>
    );
    if (referralStudentId) return (
      <button onClick={openDialog}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 active:scale-[0.98] transition-all touch-manipulation">
        <span className="text-sm font-semibold text-slate-800">{studentLabel}</span>
        <span className="flex items-center gap-1 text-emerald-700 font-semibold text-sm">Επίλυση <ChevronRight className="w-4 h-4" /></span>
      </button>
    );
    return (
      <button onClick={openDialog}
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button onClick={handlePrint}
                  className="flex flex-col items-center gap-2 px-4 py-5 rounded-2xl border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors touch-manipulation">
                  <Printer className="w-7 h-7 text-slate-600" />
                  <span className="text-sm font-semibold text-slate-700">Εκτύπωση</span>
                  <span className="text-xs text-slate-400">Απόφαση παραπτώματος</span>
                </button>
                <button onClick={handleLetter}
                  className="flex flex-col items-center gap-2 px-4 py-5 rounded-2xl border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors touch-manipulation">
                  <FileText className="w-7 h-7 text-slate-600" />
                  <span className="text-sm font-semibold text-slate-700">Επιστολή γονέων</span>
                  <span className="text-xs text-slate-400">Ενημέρωση για τα μέτρα</span>
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
              {recommendations.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  <span className="font-semibold">Εισήγηση εκπαιδευτικού: </span>
                  {recommendationsLabel(recommendations)}
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
                          onChange={() => {
                            setAction(a.value);
                            if (a.value !== "DETENTION") setExpulsionDays([]);
                            if (a.value !== "SUSPENDED_EXPULSION") { setSuspendedDays(""); setSuspendedPeriods(""); }
                          }}
                          className="sr-only" />
                        <span className="text-sm font-medium">{a.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Punishment description — required for every action type */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Περιγραφή Παιδαγωγικού Μέτρου *</label>
                  <textarea value={actionDetails} onChange={(e) => setActionDetails(e.target.value)} rows={2}
                    required
                    placeholder="Τι ακριβώς επιβλήθηκε/συμφωνήθηκε…"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                </div>

                {/* «Αποβολή με Αναστολή» — its length (days and/or periods), no dates */}
                {action === "SUSPENDED_EXPULSION" && (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-2">
                    <label className="text-sm font-semibold text-orange-900">Διάρκεια αποβολής με αναστολή</label>
                    <p className="text-xs text-orange-700">Δεν ορίζονται ημερομηνίες — εκτίεται σε περίπτωση νέου παραπτώματος.</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-orange-900">
                        <input type="number" min={0} max={SUSPENDED_MAX_DAYS} inputMode="numeric" value={suspendedDays}
                          onChange={(e) => setSuspendedDays(e.target.value)}
                          className="h-10 w-20 px-2 rounded-lg border border-orange-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                        ημέρες
                      </label>
                      <label className="flex items-center gap-2 text-sm text-orange-900">
                        <input type="number" min={0} max={SUSPENDED_MAX_PERIODS} inputMode="numeric" value={suspendedPeriods}
                          onChange={(e) => setSuspendedPeriods(e.target.value)}
                          className="h-10 w-20 px-2 rounded-lg border border-orange-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                        περίοδοι
                      </label>
                    </div>
                  </div>
                )}

                {/* Expulsion days — multi-date picker for DETENTION */}
                {action === "DETENTION" && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-red-600" />
                      <label className="text-sm font-semibold text-red-800">Ημέρες Αποβολής</label>
                    </div>

                    {/* Add date */}
                    <div className="flex gap-2">
                      <DateInput value={dateInput} min={minDay}
                        onChange={setDateInput}
                        className="flex-1 h-10 px-3 rounded-xl border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white" />
                      <button type="button" onClick={addDay} disabled={!dateInput}
                        className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-40 touch-manipulation">
                        <Plus className="w-4 h-4" /> Προσθήκη
                      </button>
                    </div>

                    {/* An expulsion can't be resolved without its days */}
                    {expulsionDays.length === 0 && (
                      <p className="text-xs font-medium text-red-700">
                        Επιλέξτε τουλάχιστον μία ημέρα και πατήστε «Προσθήκη» — χωρίς ημέρες δεν γίνεται επίλυση.
                      </p>
                    )}

                    {/* Selected days list */}
                    {expulsionDays.length > 0 && (
                      <div className="space-y-1.5">
                        {expulsionDays.map((d) => {
                          const dow = new Date(d.date + "T12:00:00").getDay();
                          const dayPeriods = periodsForDow(periodsConfig, dow);
                          const partial = isPartialDay(d);
                          const sel = "h-8 px-1.5 rounded-lg border border-red-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-red-400";
                          return (
                            <div key={d.date} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-red-200">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-red-900">{fmtDate(d.date)}</span>
                                {/* Whole day, or periods from–to */}
                                <select
                                  value={partial ? "part" : "whole"}
                                  onChange={(e) =>
                                    e.target.value === "whole"
                                      ? setDayRange(d.date, null, null)
                                      : setDayRange(d.date, 1, Math.min(2, dayPeriods.length))
                                  }
                                  className={sel}
                                >
                                  <option value="whole">Όλη η μέρα ({dayPeriods.length} περ.)</option>
                                  <option value="part">Περίοδοι…</option>
                                </select>
                                {partial && (
                                  <span className="flex items-center gap-1 text-xs text-red-800">
                                    από
                                    <select value={d.fromPeriod!} onChange={(e) => setDayRange(d.date, Number(e.target.value), d.toPeriod)} className={sel}>
                                      {dayPeriods.map((p) => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                    έως
                                    <select value={d.toPeriod!} onChange={(e) => setDayRange(d.date, d.fromPeriod, Number(e.target.value))} className={sel}>
                                      {dayPeriods.map((p) => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                  </span>
                                )}
                              </div>
                              <button type="button" onClick={() => removeDay(d.date)}
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
                          {(() => {
                            const l = expulsionLength(expulsionDays);
                            return lengthLabel(l.days, l.periods);
                          })()}
                          {" · "}
                          {totalPeriods} περίοδο{totalPeriods === 1 ? "ς" : "ι"} συνολικά
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
                      <DateInput value={parentContactDate}
                        onChange={setParentContactDate}
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
                  <Button type="submit" disabled={resolving || (action === "DETENTION" && expulsionDays.length === 0)}
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
