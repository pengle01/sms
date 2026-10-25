"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Info, Phone, X, Loader2, FileWarning, Star } from "lucide-react";
import { fmtDisplayDate } from "@/lib/dates";

const ROLE_LABEL: Record<string, string> = {
  FATHER: "Πατέρας",
  MOTHER: "Μητέρα",
  GUARDIAN: "Κηδεμόνας",
  OTHER: "Άλλο",
};


type Props = {
  studentId: string;
  excludeReferralId?: string;
  studentName?: string;
};

export function StudentInfoDialog({ studentId, excludeReferralId, studentName }: Props) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = trpc.referrals.studentContext.useQuery(
    { studentId, excludeReferralId },
    { enabled: open }
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 active:scale-95 touch-manipulation"
      >
        <Info className="w-3.5 h-3.5" />
        Στοιχεία
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h3 className="text-base font-semibold text-slate-900">
                {data?.name ?? studentName ?? "Στοιχεία μαθητή/τριας"}
                {data?.group && <span className="ml-2 text-sm font-normal text-slate-400">{data.group}</span>}
              </h3>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {isLoading && (
                <div className="flex items-center justify-center py-10 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              )}
              {error && (
                <p className="text-sm text-red-600 py-4">Σφάλμα φόρτωσης στοιχείων.</p>
              )}

              {data && (
                <>
                  {/* Contacts — every parent/guardian with all their phones; the
                      family's SMS number is marked as the preferred one */}
                  <section>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Τηλέφωνα επικοινωνίας
                    </h4>
                    {data.contactCard.parents.length === 0 &&
                    data.contactCard.homePhones.length === 0 &&
                    !data.contactCard.unmatchedSms ? (
                      <p className="text-sm text-slate-400">Δεν υπάρχουν καταχωρημένα τηλέφωνα.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {data.contactCard.parents.map((p) => (
                          <li key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                              <p className="text-xs text-slate-500">{ROLE_LABEL[p.role] ?? p.role}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {p.phones.map(({ phone, preferred }) => (
                                <span key={phone} className="flex items-center gap-1.5">
                                  {preferred && (
                                    <span
                                      title="Ο προτιμώμενος τρόπος επικοινωνίας της οικογένειας (αριθμός SMS)"
                                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                                    >
                                      <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                      Προτιμώμενο
                                    </span>
                                  )}
                                  <a
                                    href={`tel:${phone}`}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 whitespace-nowrap"
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                    {phone}
                                  </a>
                                </span>
                              ))}
                            </div>
                          </li>
                        ))}
                        {data.contactCard.homePhones.map(({ phone, preferred }) => (
                          <li key={`home-${phone}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                            <span className="text-sm text-slate-600">
                              Τηλέφωνο οικίας
                              {preferred && <span className="ml-1.5 text-[10px] font-semibold text-amber-700">★ Προτιμώμενο</span>}
                            </span>
                            <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline">
                              <Phone className="w-3.5 h-3.5" />
                              {phone}
                            </a>
                          </li>
                        ))}
                        {data.contactCard.unmatchedSms && (
                          <li className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <span className="text-xs text-amber-800">Προτιμώμενος αριθμός SMS (δεν αντιστοιχεί σε γονέα/κηδεμόνα)</span>
                            <a href={`tel:${data.contactCard.unmatchedSms}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:underline">
                              <Phone className="w-3.5 h-3.5" />
                              {data.contactCard.unmatchedSms}
                            </a>
                          </li>
                        )}
                      </ul>
                    )}
                  </section>

                  {/* Past referrals */}
                  <section>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Προηγούμενες καταγγελίες ({data.pastReferrals.length})
                    </h4>
                    {data.pastReferrals.length === 0 ? (
                      <p className="text-sm text-slate-400">Καμία προηγούμενη καταγγελία.</p>
                    ) : (
                      <ul className="space-y-2">
                        {data.pastReferrals.map((r) => (
                          <li key={r.id} className="rounded-lg border border-slate-200 px-3 py-2">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                <FileWarning className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-slate-700 font-semibold">#{r.number}</span>
                                {fmtDisplayDate(r.date)}
                                {r.location && <span className="text-slate-400">· {r.location}</span>}
                              </span>
                              {r.status === "RESOLVED" ? (
                                <span className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
                                  {r.summary ?? "Επιλύθηκε"}
                                </span>
                              ) : (
                                <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                  Εκκρεμής
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-700 line-clamp-2">{r.description}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
