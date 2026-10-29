"use client";

import { useMemo, useState } from "react";
import { Award, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
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

// Converts an activity into ΔΔΚ awards in two steps: pick the category, then
// each student's points (the guide's allowed values as buttons, «—» = none,
// pre-filled with the guide's default) — and finish.
export function ConvertToDdkForm({
  activityId,
  participants,
}: {
  activityId: string;
  participants: Participant[];
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [points, setPoints] = useState<Record<string, number>>({});

  const category = code ? findDdkCategory(code) : undefined;
  const bounds = category ? pointsBounds(category.spec) : null;
  // The values a student can get: none, then what the guide allows.
  const choices = bounds ? [0, ...Array.from({ length: bounds.max - bounds.min + 1 }, (_, i) => bounds.min + i)] : [];

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
      const def = defaultPoints(cat.spec);
      setPoints(Object.fromEntries(participants.map((p) => [p.studentId, def])));
    }
  }

  const setAll = (n: number) => setPoints(Object.fromEntries(participants.map((p) => [p.studentId, n])));
  const awarded = participants.filter((p) => (points[p.studentId] ?? 0) > 0).length;
  const total = participants.reduce((sum, p) => sum + (points[p.studentId] ?? 0), 0);

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

  const pill = (active: boolean) =>
    cn(
      "min-w-9 h-8 px-2 rounded-lg border text-sm font-semibold tabular-nums",
      active ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-amber-400",
    );

  return (
    <form
      action={async (fd) => {
        await convertActivityToDdk(fd);
        // Done: close the form; the awards appear in the list above.
        setOpen(false);
        setCode("");
        setPoints({});
      }}
      className="space-y-4"
    >
      <input type="hidden" name="activityId" value={activityId} />

      {/* 1 — Category */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          1. Τομέας ΔΔΚ
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
          <p className="text-xs text-amber-800">
            {pointSpecReasoning(category.spec)}
            {category.hint && <span className="text-amber-700"> {category.hint}</span>}
          </p>
        )}
      </div>

      {/* 2 — Points per student */}
      {category && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              2. Μονάδες ανά μαθητή/τρια
            </label>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              Όλοι:
              {choices.map((n) => (
                <button key={n} type="button" onClick={() => setAll(n)} className={pill(false)}>
                  {n === 0 ? "—" : n}
                </button>
              ))}
            </span>
          </div>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {participants.map((p) => {
              const value = points[p.studentId] ?? 0;
              return (
                <div key={p.studentId} className={cn("flex items-center gap-3 px-3 py-2", value === 0 && "opacity-60")}>
                  <input type="hidden" name="studentId" value={p.studentId} />
                  <input type="hidden" name={`points_${p.studentId}`} value={value} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.group}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {choices.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPoints((pt) => ({ ...pt, [p.studentId]: n }))}
                        aria-pressed={value === n}
                        className={pill(value === n)}
                      >
                        {n === 0 ? "—" : n}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            {awarded} από {participants.length} μαθητές/τριες · {total} μονάδες. Με «—» ο/η μαθητής/τρια δεν παίρνει μονάδες.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!category || awarded === 0}
          className="inline-flex items-center gap-2 h-9 px-5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
        >
          <Award className="w-4 h-4" />
          Ολοκλήρωση
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
