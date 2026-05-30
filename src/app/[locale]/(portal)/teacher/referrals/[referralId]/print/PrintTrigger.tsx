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
