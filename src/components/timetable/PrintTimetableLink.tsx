"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Printer } from "lucide-react";
import { timetablePrintHref, type PrintKind } from "@/lib/timetablePrint";

/** Opens the printable fixed weekly timetable in a new tab; «Πίσω» returns here. */
export function PrintTimetableLink({ kind, value }: { kind: PrintKind; value: string }) {
  const t = useTranslations("timetablePrint");
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const back = search ? `${pathname}?${search}` : pathname;
  return (
    <a
      href={timetablePrintHref(locale, { kind, key: value }, back)}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors"
    >
      <Printer className="w-3.5 h-3.5" />
      {t("print")}
    </a>
  );
}
