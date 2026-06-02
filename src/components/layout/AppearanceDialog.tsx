"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { useRouter } from "next/navigation";
import { Palette, X, Check } from "lucide-react";

const THEMES = [
  { key: "emerald", label: "Πράσινο", color: "oklch(0.696 0.17 162.48)" },
  { key: "ocean", label: "Μπλε", color: "oklch(0.623 0.214 259.815)" },
  { key: "violet", label: "Μωβ", color: "oklch(0.606 0.25 292.717)" },
  { key: "rose", label: "Ροζ", color: "oklch(0.645 0.246 16.439)" },
  { key: "amber", label: "Κεχριμπάρι", color: "oklch(0.769 0.188 70.08)" },
] as const;

const SIZES = [
  { key: "small", label: "Μικρά", sample: "text-sm" },
  { key: "medium", label: "Μεσαία", sample: "text-lg" },
  { key: "large", label: "Μεγάλα", sample: "text-2xl" },
] as const;

export function AppearanceDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("emerald");
  const [font, setFont] = useState("small");

  const update = trpc.preferences.update.useMutation({
    onSuccess: (res) => {
      // Apply instantly, then refresh so the SSR'd <html> stays authoritative.
      document.documentElement.dataset.theme = res.colorTheme;
      document.documentElement.dataset.font = res.fontSize;
      router.refresh();
    },
  });

  const openDialog = () => {
    setTheme(document.documentElement.dataset.theme ?? "emerald");
    setFont(document.documentElement.dataset.font ?? "small");
    setOpen(true);
  };

  const pickTheme = (key: string) => {
    setTheme(key);
    document.documentElement.dataset.theme = key; // optimistic preview
    update.mutate({ colorTheme: key as (typeof THEMES)[number]["key"] });
  };

  const pickFont = (key: string) => {
    setFont(key);
    document.documentElement.dataset.font = key; // optimistic preview
    update.mutate({ fontSize: key as (typeof SIZES)[number]["key"] });
  };

  return (
    <>
      <button
        onClick={openDialog}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 touch-manipulation"
      >
        <Palette className="w-4 h-4" />
        Εμφάνιση
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Palette className="w-4 h-4" /> Εμφάνιση
              </h3>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* Colour palette */}
              <section>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Χρώμα
                </h4>
                <div className="flex flex-wrap gap-3">
                  {THEMES.map((th) => (
                    <button
                      key={th.key}
                      onClick={() => pickTheme(th.key)}
                      title={th.label}
                      className={`relative w-11 h-11 rounded-full border-2 transition-transform active:scale-90 touch-manipulation ${
                        theme === th.key ? "border-slate-800 scale-105" : "border-transparent"
                      }`}
                      style={{ background: th.color }}
                      aria-label={th.label}
                    >
                      {theme === th.key && (
                        <Check className="w-5 h-5 text-white absolute inset-0 m-auto drop-shadow" />
                      )}
                    </button>
                  ))}
                </div>
              </section>

              {/* Font size */}
              <section>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Μέγεθος γραμμάτων
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {SIZES.map((sz) => (
                    <button
                      key={sz.key}
                      onClick={() => pickFont(sz.key)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 transition-colors touch-manipulation ${
                        font === sz.key
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`font-semibold leading-none ${sz.sample}`}>Α</span>
                      <span className="text-xs">{sz.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
