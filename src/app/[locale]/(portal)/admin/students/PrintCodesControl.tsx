"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Printer } from "lucide-react";

/** Pick a homegroup (or all) and open its access-code slips for printing. */
export function PrintCodesControl({ locale, groups }: { locale: string; groups: { id: string; name: string }[] }) {
  const t = useTranslations("codeSlips");
  const [groupId, setGroupId] = useState("");
  return (
    <div className="inline-flex items-center gap-1.5">
      <select
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        aria-label={t("pickGroup")}
        className="h-9 px-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white"
      >
        <option value="">{t("pickGroup")}</option>
        <option value="all">{t("allGroups")}</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={!groupId}
        onClick={() => window.open(`/${locale}/admin/students/codes/print?groupId=${encodeURIComponent(groupId)}`, "_blank")}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        <Printer className="w-4 h-4" />
        {t("print")}
      </button>
    </div>
  );
}
