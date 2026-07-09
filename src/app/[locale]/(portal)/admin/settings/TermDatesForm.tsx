"use client";

import { useState, useTransition } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { EditControls } from "./EditControls";

export interface TermDatesValues {
  term1Start: string;
  term1End: string;
  testDeadline1: string;
  term2Start: string;
  term2End: string;
  testDeadline2: string;
  christmasStart: string;
  christmasEnd: string;
  easterStart: string;
  easterEnd: string;
}

interface Props {
  /** "YYYY-MM-DD" values (config if set, otherwise computed defaults / ""). */
  initial: TermDatesValues;
}

type FieldKey = keyof TermDatesValues;

const SECTIONS: Array<{
  title: string;
  fields: Array<{ key: FieldKey; label: string }>;
}> = [
  {
    title: "Α΄ Τετράμηνο",
    fields: [
      { key: "term1Start", label: "Έναρξη" },
      { key: "term1End", label: "Λήξη" },
      { key: "testDeadline1", label: "Τελευταία ημέρα διαγωνισμάτων" },
    ],
  },
  {
    title: "Β΄ Τετράμηνο",
    fields: [
      { key: "term2Start", label: "Έναρξη" },
      { key: "term2End", label: "Λήξη" },
      { key: "testDeadline2", label: "Τελευταία ημέρα διαγωνισμάτων" },
    ],
  },
  {
    title: "Διακοπές Χριστουγέννων",
    fields: [
      { key: "christmasStart", label: "Πρώτη ημέρα" },
      { key: "christmasEnd", label: "Τελευταία ημέρα" },
    ],
  },
  {
    title: "Διακοπές Πάσχα",
    fields: [
      { key: "easterStart", label: "Πρώτη ημέρα" },
      { key: "easterEnd", label: "Τελευταία ημέρα" },
    ],
  },
];

function validate(v: TermDatesValues): string | null {
  if (!v.term1Start || !v.term1End || !v.term2Start || !v.term2End) {
    return "Οι τέσσερις ημερομηνίες έναρξης/λήξης των τετραμήνων είναι υποχρεωτικές.";
  }
  if (!(v.term1Start <= v.term1End && v.term1End < v.term2Start && v.term2Start <= v.term2End)) {
    return "Οι ημερομηνίες πρέπει να είναι με τη σειρά: έναρξη Α΄ ≤ λήξη Α΄ < έναρξη Β΄ ≤ λήξη Β΄.";
  }
  if (v.testDeadline1 && !(v.term1Start <= v.testDeadline1 && v.testDeadline1 <= v.term1End)) {
    return "Η προθεσμία διαγωνισμάτων του Α΄ πρέπει να βρίσκεται εντός του Α΄ τετραμήνου.";
  }
  if (v.testDeadline2 && !(v.term2Start <= v.testDeadline2 && v.testDeadline2 <= v.term2End)) {
    return "Η προθεσμία διαγωνισμάτων του Β΄ πρέπει να βρίσκεται εντός του Β΄ τετραμήνου.";
  }
  for (const [s, e, name] of [
    [v.christmasStart, v.christmasEnd, "Χριστουγέννων"],
    [v.easterStart, v.easterEnd, "Πάσχα"],
  ] as const) {
    if (!!s !== !!e) return `Οι διακοπές ${name} χρειάζονται και πρώτη και τελευταία ημέρα.`;
    if (s && e && s > e) return `Διακοπές ${name}: η πρώτη ημέρα πρέπει να προηγείται της τελευταίας.`;
  }
  return null;
}

export function TermDatesForm({ initial }: Props) {
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const { mutate } = trpc.settings.upsert.useMutation({
    onSuccess: () => {
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) => toast.error(e.message),
  });

  const error = editing ? validate(values) : null;

  function save() {
    if (error) return;
    const payload = Object.fromEntries(Object.entries(values).filter(([, v]) => v));
    startTransition(() => {
      mutate({ key: "termDates", value: JSON.stringify(payload) });
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400">
        Το υπουργείο ανακοινώνει αυτές τις ημερομηνίες στην αρχή κάθε σχολικής
        χρονιάς. Καθορίζουν τα σύνολα απουσιών ανά τετράμηνο, τις προθεσμίες
        προγραμματισμού διαγωνισμάτων και τις αργίες που εμφανίζονται στην εφαρμογή.
      </p>

      {SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            {section.title}
          </p>
          <div className="flex gap-3 flex-wrap">
            {section.fields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
                <input
                  type="date"
                  value={values[f.key]}
                  disabled={!editing}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [f.key]: e.target.value }));
                    setSaved(false);
                  }}
                  className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <EditControls
        editing={editing}
        pending={pending}
        saved={saved}
        canSave={!error}
        onEdit={() => setEditing(true)}
        onCancel={() => { setValues(initial); setEditing(false); }}
        onSave={save}
      />
    </div>
  );
}
