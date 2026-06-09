"use client";

// Screen-only controls for the ΔΔΚ report (hidden when printing).
export function PrintBar({ backHref }: { backHref: string }) {
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
