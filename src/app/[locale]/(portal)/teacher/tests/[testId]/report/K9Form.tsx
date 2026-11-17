"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { GRADE_BANDS, type GradeBand } from "@/lib/testReport";

// The official paper form is Greek only, so its labels are fixed here rather
// than translated.

function Dots({ className = "flex-1" }: { className?: string }) {
  return <span className={`inline-block border-b border-dotted border-slate-500 min-w-8 ${className}`}>&nbsp;</span>;
}

function Field({ label, value, className = "flex-1" }: { label: string; value?: string | number; className?: string }) {
  return (
    <span className={`flex items-baseline gap-1 ${className}`}>
      <span className="whitespace-nowrap">{label}:</span>
      <span className="flex-1 border-b border-dotted border-slate-500 px-1 font-semibold">{value ?? " "}</span>
    </span>
  );
}

export function K9Form(props: {
  backHref: string;
  schoolName: string | null;
  schoolYear: string;
  teacherName: string;
  groupName: string;
  studentCount: number;
  termLabel: string;
  courseName: string;
  dateLabel: string;
  durationLabel: string;
  students: { id: string; name: string }[];
  initialAbsentIds: string[];
  bandCounts: Record<GradeBand, number>;
  gradedTotal: number;
}) {
  const [absent, setAbsent] = useState<string[]>(props.initialAbsentIds);
  const nameOf = new Map(props.students.map((s) => [s.id, s.name]));
  const addable = props.students.filter((s) => !absent.includes(s.id));
  const rows = Math.max(7, absent.length);

  return (
    <>
      <div className="print:hidden border-b border-slate-200 bg-slate-50 px-8 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <a href={props.backHref} className="text-sm text-slate-500 hover:text-slate-800">← Επιστροφή</a>
          <button
            onClick={() => window.print()}
            className="px-5 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
          >
            Εκτύπωση
          </button>
        </div>
        <div className="text-sm text-slate-600 space-y-2">
          <p>
            Απόντες/ούσες από το παρουσιολόγιο της ώρας του διαγωνίσματος. Μπορείτε να αφαιρέσετε ή να προσθέσετε
            μαθητές/τριες πριν την εκτύπωση (δεν αποθηκεύεται).
          </p>
          <div className="flex flex-wrap gap-2">
            {absent.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 pl-3 pr-1 py-0.5">
                {nameOf.get(id)}
                <button
                  type="button"
                  aria-label="Αφαίρεση"
                  onClick={() => setAbsent((a) => a.filter((x) => x !== id))}
                  className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            {addable.length > 0 && (
              <select
                value=""
                onChange={(e) => e.target.value && setAbsent((a) => [...a, e.target.value])}
                className="h-7 rounded-md border border-slate-200 bg-white px-2 text-sm"
              >
                <option value="">+ Προσθήκη απόντα/ουσας…</option>
                {addable.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="k9 max-w-3xl mx-auto px-10 py-8 print:p-0 text-[13px] text-slate-900 bg-white">
        <div className="flex items-end justify-between border-b border-slate-800 pb-1">
          <span className="font-semibold">{props.schoolName ?? ""}</span>
          <span>ΣΧΟΛΙΚΗ ΧΡΟΝΙΑ {props.schoolYear}</span>
        </div>

        <h1 className="text-center font-bold text-base underline mt-6 mb-5">ΑΠΟΤΕΛΕΣΜΑΤΑ ΔΙΑΓΩΝΙΣΜΑΤΟΣ</h1>

        <div className="space-y-3">
          <Field label="Ονοματεπώνυμο Εκπαιδευτικού" value={props.teacherName} />
          <div className="flex gap-4">
            <Field label="Τμήμα" value={props.groupName} />
            <Field label="Αρ. Μαθητών" value={props.studentCount} className="w-40" />
            <Field label="Τετράμηνο" value={props.termLabel} className="w-36" />
          </div>
          <Field label="Μάθημα" value={props.courseName} />
          <div className="flex gap-10 pt-1">
            <span className="flex items-center gap-2">Προειδοποιημένο: <span className="inline-block w-4 h-4 border border-slate-700" /></span>
            <span className="flex items-center gap-2">Απροειδοποίητο: <span className="inline-block w-4 h-4 border border-slate-700" /></span>
          </div>
          <div className="flex gap-4">
            <Field label="Ημερομηνία διεξαγωγής διαγωνίσματος" value={props.dateLabel} />
            <Field label="Διάρκεια" value={props.durationLabel} className="w-40" />
          </div>
        </div>

        <table className="w-full mt-6 border border-slate-700 border-collapse">
          <thead>
            <tr>
              <th colSpan={2} className="border border-slate-700 py-1 font-bold">ΑΠΟΝΤΕΣ ΜΑΘΗΤΕΣ/ΤΡΙΕΣ</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i}>
                <td className="border border-slate-700 w-8 px-2 py-0.5 text-center">{i + 1}.</td>
                <td className="border border-slate-700 px-2 py-0.5">{absent[i] ? nameOf.get(absent[i]!) : " "}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex gap-1 mt-5">
          <span>Ημερομηνία επιστροφής στους μαθητές:</span>
          <Dots className="w-48" />
        </div>

        <table className="w-full mt-5 border border-slate-700 border-collapse text-center">
          <thead>
            <tr>
              <th colSpan={GRADE_BANDS.length + 2} className="border border-slate-700 py-1 font-bold">Αποτελέσματα διαγωνίσματος</th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold">
              <td className="border border-slate-700 py-1.5">Βαθμολογία</td>
              {GRADE_BANDS.map((b) => (
                <td key={b} className="border border-slate-700 py-1.5">{b}</td>
              ))}
              <td className="border border-slate-700 py-1.5">Σύνολο Μαθητών</td>
            </tr>
            <tr>
              <td className="border border-slate-700 py-1.5 font-semibold">Αρ. μαθητών</td>
              {GRADE_BANDS.map((b) => (
                <td key={b} className="border border-slate-700 py-1.5">{props.bandCounts[b]}</td>
              ))}
              <td className="border border-slate-700 py-1.5 font-semibold">{props.gradedTotal}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-5">Παρατηρήσεις:</p>
        <div className="border border-slate-700">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-7 border-b border-slate-400 last:border-0" />
          ))}
        </div>

        <div className="flex gap-1 mt-6">
          <span>Ημερομηνία παράδοσης διαγωνίσματος και αποτελεσμάτων στον Συντονιστή:</span>
          <Dots />
        </div>

        <div className="flex justify-between mt-8">
          <div className="w-56">
            <p>Υπογραφή Εκπαιδευτικού</p>
            <div className="mt-10 border-b border-dotted border-slate-500" />
          </div>
          <div className="w-56">
            <p>Υπογραφή Συντονιστή</p>
            <div className="mt-10 border-b border-dotted border-slate-500" />
          </div>
        </div>

        <p className="mt-8 text-[10px]">ΕΝΤΥΠΟ: Κ9</p>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white !important; }
          main { padding: 0 !important; }
          .k9 { max-width: none; }
        }
      `}</style>
    </>
  );
}
