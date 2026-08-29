"use client";

import { useEffect } from "react";

// Auto-triggers window.print() when the page is opened directly from the
// "Print" button in the resolve dialog (query param ?auto=1).
export function PrintTrigger() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auto") === "1") {
        // Small delay so the page renders fully before printing
        const t = setTimeout(() => window.print(), 400);
        return () => clearTimeout(t);
      }
    }
  }, []);
  return null;
}

/**
 * The on-screen "print" button.
 *
 * Lives here rather than in the page because the page is a Server Component,
 * and an onClick handler there is not merely inert — React refuses to
 * serialize a function prop and throws "Event handlers cannot be passed to
 * Client Component props", taking the whole page down. Any interactivity on
 * this document has to be a client component.
 */
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-5 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
    >
      Εκτύπωση
    </button>
  );
}
