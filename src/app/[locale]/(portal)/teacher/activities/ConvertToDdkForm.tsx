"use client";

import { useMemo, useState } from "react";
import { Award, ChevronDown } from "lucide-react";
import {
  CONVERTIBLE_CATALOG,
  DDK_SECTIONS,
  findDdkCategory,
  defaultPoints,
  pointsBounds,
  pointSpecLabel,
  pointSpecReasoning,
} from "@/lib/ddk";
import { convertActivityToDdk } from "./actions";

interface Participant {
  studentId: string;
  name: string;
  group: string;
}

// Converts an activity into ΔΔΚ awards: pick one category, then award points to
// the selected participants. Points pre-fill from the guide; ranges are editable
// per student (e.g. theatre: leading 3 / supporting 1), fixed/per are locked.
export function ConvertToDdkForm({
  activityId,
  participants,
}: {
  activityId: string;
  participants: Participant[];
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(participants.map((p) => [p.studentId, true]))
  );
  const [points, setPoints] = useState<Record<string, string>>({});

  const category = code ? findDdkCategory(code) : undefined;
  const fallback = category ? defaultPoints(category.spec) : 1;
  const bounds = category ? pointsBounds(category.spec) : { min: 1, max: 50 };
  // Fixed / per-participation categories have a single allowed value — locked.
  const locked = bounds.min === bounds.max;

  // Group the (hand-awardable) catalog into <optgroup>s following the guide.
  const grouped = useMemo(
    () =>
      DDK_SECTIONS.map((s) => ({
        section: s,
        items: CONVERTIBLE_CATALOG.filter((c) => c.section === s.key),
      })).filter((g) => g.items.length > 0),
    []
  );

  function pickCategory(next: string) {
    setCode(next);
    const cat = findDdkCategory(next);
    if (cat) {
      const def = String(defaultPoints(cat.spec));
      setPoints(Object.fromEntries(participants.map((p) => [p.studentId, def])));
    }
  }

  const selectedCount = participants.filter((p) => checked[p.studentId]).length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600"
      >
        <Award className="w-4 h-4" />
        Μετατροπή σε ΔΔΚ
      </button>
    );
  }

  return (
    <form action={convertActivityToDdk} className="space-y-4">
      <input type="hidden" name="activityId" value={activityId} />

      {/* Category */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Τομέας ΔΔΚ
        </label>
        <div className="relative">
          <select
            name="categoryCode"
            value={code}
            onChange={(e) => pickCategory(e.target.value)}
            required
            className="w-full h-10 pl-3 pr-9 rounded-lg border border-slate-200 text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="" disabled>
              Επιλέξτε κατηγορία…
            </option>
            {grouped.map((g) => (
              <optgroup key={g.section.key} label={g.section.label}>
                {g.items.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} ({pointSpecLabel(c.spec)})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
        </div>
        {category && (
          <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 space-y-0.5">
            <p className="font-semibold">Μονάδες: {pointSpecLabel(category.spec)}</p>
            <p>{pointSpecReasoning(category.spec)}</p>
            {category.hint && <p className="text-amber-700">{category.hint}</p>}
          </div>
        )}
      </div>

      {/* Optional note */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Σημείωση (προαιρετικά)
        </label>
        <input
          type="text"
          name="note"
          placeholder="π.χ. τίτλος διάκρισης, λεπτομέρεια"
          className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {/* Participants + per-student points */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Μαθητές ({selectedCount})
          </label>
          <span className="text-xs text-slate-400">Μονάδες ανά μαθητή</span>
        </div>
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-80 overflow-y-auto">
          {participants.map((p) => {
            const on = !!checked[p.studentId];
            return (
              <div
                key={p.studentId}
                className={`flex items-center gap-3 px-3 py-2 ${on ? "" : "opacity-50"}`}
              >
                <input
                  type="checkbox"
                  name="studentId"
                  value={p.studentId}
                  checked={on}
                  onChange={(e) =>
                    setChecked((c) => ({ ...c, [p.studentId]: e.target.checked }))
                  }
                  className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.group}</p>
                </div>
                <input
                  type="number"
                  name={`points_${p.studentId}`}
                  min={bounds.min}
                  max={bounds.max}
                  disabled={!on || !code || locked}
                  value={points[p.studentId] ?? String(fallback)}
                  onChange={(e) =>
                    setPoints((pt) => ({ ...pt, [p.studentId]: e.target.value }))
                  }
                  title={locked ? "Σταθερές μονάδες" : `Επιτρεπτό: ${bounds.min}-${bounds.max}`}
                  className="w-16 h-9 px-2 text-center rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!code || selectedCount === 0}
          className="inline-flex items-center gap-2 h-9 px-5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
        >
          <Award className="w-4 h-4" />
          Καταχώρηση ΔΔΚ
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
        >
          Άκυρο
        </button>
      </div>
    </form>
  );
}
