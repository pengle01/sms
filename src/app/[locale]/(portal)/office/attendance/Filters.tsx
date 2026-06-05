"use client";

import { useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

// Auto-submitting filter bar: pick a date (or group / window) and the
// absences appear — no Apply button needed.
export function AttendanceFilters({
  groups,
  date,
  groupId,
  todayStr,
}: {
  groups: { id: string; name: string }[];
  date?: string;
  groupId?: string;
  todayStr: string;
}) {
  const t = useTranslations("officeAttendance");
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();

  return (
    <form ref={formRef} method="GET" className="flex gap-3 flex-wrap items-center">
      <input
        type="date"
        name="date"
        defaultValue={date ?? ""}
        max={todayStr}
        onChange={submit}
        title={t("dateHint")}
        className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
      />
      {date && (
        <Link
          href="?"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-500"
          title={t("clearDate")}
        >
          <X className="w-3.5 h-3.5" />
          {t("clearDate")}
        </Link>
      )}
      <select
        name="groupId"
        defaultValue={groupId ?? ""}
        onChange={submit}
        className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
      >
        <option value="">{t("allGroups")}</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
    </form>
  );
}
