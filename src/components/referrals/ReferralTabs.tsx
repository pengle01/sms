"use client";

import { useState, type ReactNode } from "react";

type Tab = {
  key: string;
  label: string;
  count?: number;
  /** Colour the count badge to draw attention (e.g. items needing action). */
  highlight?: boolean;
  content: ReactNode;
};

export function ReferralTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-full sm:w-auto sm:inline-flex">
        {tabs.map((t) => {
          const isActive = t.key === activeTab?.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                isActive ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-xs font-semibold ${
                    t.highlight
                      ? "bg-red-500 text-white"
                      : isActive
                      ? "bg-slate-200 text-slate-700"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div>{activeTab?.content}</div>
    </div>
  );
}
