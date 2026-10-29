"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Printer } from "lucide-react";
import { timetablePrintHref } from "@/lib/timetablePrint";

/** «Εκτύπωση ειδικοτήτων»: one button that opens the list of specialties;
 *  clicking one prints every teacher's weekly timetable in it, one page
 *  each, in a new tab («Πίσω» returns here). */
export function PrintSpecialtyPicker({ specialties }: { specialties: { code: string; count: number }[] }) {
  const t = useTranslations("timetablePrint");
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (specialties.length === 0) return null;
  const back = search ? `${pathname}?${search}` : pathname;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors"
      >
        <Printer className="w-4 h-4" />
        {t("printSpecialties")}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-64 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1"
        >
          <p className="px-3 py-1.5 text-xs text-slate-400">{t("printSpecialtiesHint")}</p>
          {specialties.map((s) => (
            <a
              key={s.code}
              role="menuitem"
              href={timetablePrintHref(locale, { kind: "specialty", key: s.code }, back)}
              target="_blank"
              rel="noopener"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <span className="font-medium">{s.code}</span>
              <span className="text-xs text-slate-400">{t("specialtyCount", { count: s.count })}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
