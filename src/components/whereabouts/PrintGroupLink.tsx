"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Printer } from "lucide-react";
import { groupListPrintHref } from "@/lib/groupList";

/** Opens the printable student list of a group in a new tab; «Πίσω» returns here. */
export function PrintGroupLink({ groupId }: { groupId: string }) {
  const t = useTranslations("whereabouts");
  const locale = useLocale();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const back = search ? `${pathname}?${search}` : pathname;
  return (
    <a
      href={groupListPrintHref(locale, groupId, back)}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors"
    >
      <Printer className="w-3.5 h-3.5" />
      {t("printStudentList")}
    </a>
  );
}
