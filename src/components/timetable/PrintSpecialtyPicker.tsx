"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Printer } from "lucide-react";
import { timetablePrintHref } from "@/lib/timetablePrint";

/** Pick a specialty code and print every teacher's weekly timetable in it,
 *  one page each, in a new tab; «Πίσω» returns here. */
export function PrintSpecialtyPicker({ specialties }: { specialties: { code: string; count: number }[] }) {
  const t = useTranslations("timetablePrint");
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [code, setCode] = useState("");
  if (specialties.length === 0) return null;
  const back = search ? `${pathname}?${search}` : pathname;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="print-specialty" className="text-xs font-medium text-slate-500 whitespace-nowrap">
        {t("specialty")}
      </label>
      <select
        id="print-specialty"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <option value="">{t("specialtyPick")}</option>
        {specialties.map((s) => (
          <option key={s.code} value={s.code}>
            {t("specialtyOption", { code: s.code, count: s.count })}
          </option>
        ))}
      </select>
      {code ? (
        <a
          href={timetablePrintHref(locale, { kind: "specialty", key: code }, back)}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          {t("printSpecialty")}
        </a>
      ) : (
        <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-100 text-xs font-medium text-slate-300">
          <Printer className="w-3.5 h-3.5" />
          {t("printSpecialty")}
        </span>
      )}
    </div>
  );
}
