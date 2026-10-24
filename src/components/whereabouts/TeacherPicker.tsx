"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { matchesSearch } from "@/lib/textSearch";

const MAX_PILLS = 40;

/**
 * Type part of a name and the matching teachers appear as buttons right away
 * — no dropdown, no Enter needed. A button opens that teacher's week; Enter
 * opens it when only one matches.
 */
export function TeacherPicker({
  roster,
  initialQuery,
  selected,
  aside,
}: {
  roster: { scheduleName: string; accountName: string | null }[];
  initialQuery: string;
  /** The teacher whose week is shown, if any. */
  selected: string | null;
  /** Shown at the right end of the search row (the specialty print), above the buttons. */
  aside?: React.ReactNode;
}) {
  const t = useTranslations("whereabouts");
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const q = query.trim();
  const matches = q
    ? roster
        .filter((r) => matchesSearch(r.scheduleName, q) || matchesSearch(r.accountName, q))
        .sort((a, b) => a.scheduleName.localeCompare(b.scheduleName, "el"))
    : [];
  const href = (name: string) => `?tab=teachers&teacher=${encodeURIComponent(name)}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches.length === 1) {
                e.preventDefault();
                router.push(href(matches[0]!.scheduleName), { scroll: false });
              }
            }}
            autoComplete="off"
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-9 w-72 max-w-full pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        {aside}
      </div>
      {!q ? (
        <p className="text-sm text-slate-500">{t("searchHint")}</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-slate-500">{t("noTeacher", { query: q })}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {matches.slice(0, MAX_PILLS).map((m) => (
            <Link
              key={m.scheduleName}
              href={href(m.scheduleName)}
              scroll={false}
              className={cn(
                "h-8 px-3 inline-flex items-center rounded-lg border text-sm transition-colors",
                m.scheduleName === selected
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:text-emerald-700",
              )}
            >
              {m.scheduleName}
            </Link>
          ))}
          {matches.length > MAX_PILLS && (
            <span className="h-8 inline-flex items-center text-xs text-slate-400">
              {t("moreMatches", { count: matches.length - MAX_PILLS })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
