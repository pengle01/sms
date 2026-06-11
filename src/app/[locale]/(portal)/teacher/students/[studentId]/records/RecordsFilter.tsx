"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ListFilter } from "lucide-react";

const CATS = [
  { key: "all", label: "Όλα" },
  { key: "absences", label: "Απουσίες" },
  { key: "referrals", label: "Καταγγελίες" },
  { key: "toilet", label: "Τουαλέτα" },
  { key: "tests", label: "Διαγωνίσματα" },
] as const;

const STATUSES = [
  { key: "all", label: "Όλες" },
  { key: "ABSENT", label: "Απουσία" },
  { key: "LATE", label: "Καθυστέρηση" },
  { key: "EXCUSED", label: "Δικαιολογημένη" },
] as const;

export function RecordsFilter({
  initial,
}: {
  initial: { from: string; to: string; cat: string; status: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [cat, setCat] = useState(initial.cat);
  const [status, setStatus] = useState(initial.status);

  const showStatus = cat === "all" || cat === "absences";

  function apply() {
    const p = new URLSearchParams();
    p.set("from", from);
    p.set("to", to);
    if (cat !== "all") p.set("cat", cat);
    if (showStatus && status !== "all") p.set("status", status);
    startTransition(() => router.push(`${pathname}?${p.toString()}`));
  }

  const inputCls =
    "h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-700";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3 shadow-sm">
      {/* Category — segmented control */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {CATS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCat(c.key)}
            className={cn(
              "px-3.5 py-1.5 text-sm rounded-md transition-colors",
              cat === c.key
                ? "bg-white shadow-sm text-slate-900 font-medium"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Date range + (conditional) absence type + apply */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-500">Χρονικό διάστημα</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className={inputCls}
            />
            <span className="text-slate-300">—</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {showStatus && (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500">Τύπος απουσίας</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          onClick={apply}
          disabled={pending}
          className="h-9 px-5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          <ListFilter className="w-4 h-4" />
          Εφαρμογή
        </button>
      </div>
    </div>
  );
}
