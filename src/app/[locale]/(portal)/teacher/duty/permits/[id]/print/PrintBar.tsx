"use client";

import { useEffect } from "react";

// Screen-only controls + optional auto-print (?auto=1, straight after issuing).
export function PrintBar({ backHref }: { backHref: string }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auto") === "1") {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <div className="print:hidden flex items-center justify-between px-8 py-4 border-b border-slate-200 bg-slate-50">
      <a href={backHref} className="text-sm text-slate-500 hover:text-slate-800">
        ← Επιστροφή
      </a>
      <button
        onClick={() => window.print()}
        className="px-5 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
      >
        Εκτύπωση
      </button>
    </div>
  );
}
