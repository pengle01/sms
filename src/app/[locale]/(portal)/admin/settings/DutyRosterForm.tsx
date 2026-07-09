"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { EditControls } from "./EditControls";
import { saveDutyRoster } from "./actions";

const DAYS = [
  { dow: 1, label: "Δευτέρα" },
  { dow: 2, label: "Τρίτη" },
  { dow: 3, label: "Τετάρτη" },
  { dow: 4, label: "Πέμπτη" },
  { dow: 5, label: "Παρασκευή" },
];

export interface DutyDeputyOption {
  staffProfileId: string;
  name: string;
}

interface Props {
  /** Current schedule: weekday → assigned staffProfileIds. */
  initial: Record<number, string[]>;
  /** Eligible deputies (active headteachers with a staff profile). */
  deputies: DutyDeputyOption[];
}

export function DutyRosterForm({ initial, deputies }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<number, string[]>>(initial);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const nameOf = (id: string) => deputies.find((d) => d.staffProfileId === id)?.name ?? id;

  function add(dow: number, staffProfileId: string) {
    if (!staffProfileId) return;
    setValues((v) => ({
      ...v,
      [dow]: [...(v[dow] ?? []).filter((id) => id !== staffProfileId), staffProfileId],
    }));
    setSaved(false);
  }

  function remove(dow: number, staffProfileId: string) {
    setValues((v) => ({ ...v, [dow]: (v[dow] ?? []).filter((id) => id !== staffProfileId) }));
    setSaved(false);
  }

  function save() {
    const entries = DAYS.flatMap(({ dow }) =>
      (values[dow] ?? []).map((staffProfileId) => ({ dayOfWeek: dow, staffProfileId }))
    );
    startTransition(async () => {
      const res = await saveDutyRoster(entries);
      if (res.ok) {
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Σταθερό εβδομαδιαίο πρόγραμμα: ο ορισμένος βοηθός διευθυντής εφημερεύει
        κάθε εβδομάδα τη συγκεκριμένη ημέρα. Τα συμβάντα εφημερίας (παραπομπές,
        άδειες εξόδου) θα δρομολογούνται σε αυτόν.
      </p>

      <div className="divide-y divide-slate-100">
        {DAYS.map(({ dow, label }) => {
          const assigned = values[dow] ?? [];
          const available = deputies.filter((d) => !assigned.includes(d.staffProfileId));
          return (
            <div key={dow} className="py-2.5 flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-slate-700 w-24 flex-shrink-0 pt-1">
                {label}
              </span>
              <div className="flex flex-wrap gap-1.5 justify-end items-center">
                {assigned.length === 0 && !editing && (
                  <span className="text-xs text-slate-300">—</span>
                )}
                {assigned.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs px-2.5 py-1"
                  >
                    {nameOf(id)}
                    {editing && (
                      <button
                        type="button"
                        onClick={() => remove(dow, id)}
                        className="text-indigo-400 hover:text-indigo-700"
                        aria-label={`Αφαίρεση ${nameOf(id)}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
                {editing && available.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => add(dow, e.target.value)}
                    className="h-7 px-2 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">+ Προσθήκη…</option>
                    {available.map((d) => (
                      <option key={d.staffProfileId} value={d.staffProfileId}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {deputies.length === 0 && (
        <p className="text-xs text-amber-600">
          Δεν βρέθηκαν ενεργοί βοηθοί διευθυντές με συνδεδεμένο προφίλ
          προσωπικού — συνδέστε τους πρώτα στην ενότητα Προσωπικό.
        </p>
      )}

      <EditControls
        editing={editing}
        pending={pending}
        saved={saved}
        onEdit={() => setEditing(true)}
        onCancel={() => { setValues(initial); setEditing(false); }}
        onSave={save}
      />
    </div>
  );
}
