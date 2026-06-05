"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Send } from "lucide-react";

type Recipient = {
  id: string;
  label: string;
  sub: string | null;
  specialty: string | null;
  homeroomGrades: number[];
};

const GRADE_LABELS: Record<number, string> = { 1: "Α΄", 2: "Β΄", 3: "Γ΄", 4: "Δ΄" };
const gradeLabel = (g: number) => GRADE_LABELS[g] ?? String(g);

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("staffNotify");
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
    >
      <Send className="w-4 h-4" />
      {pending ? t("sending") : t("send")}
    </button>
  );
}

export function ComposeForm({
  recipients,
  action,
}: {
  recipients: Recipient[];
  action: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("staffNotify");
  const [mode, setMode] = useState<"all" | "pick">("all");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = filter.trim()
    ? recipients.filter((r) =>
        `${r.label} ${r.sub ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase())
      )
    : recipients;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Quick-pick chips: a chip selects its whole set; clicking again deselects it
  const specialties = [...new Set(recipients.map((r) => r.specialty).filter(Boolean))].sort() as string[];
  const homeroomYears = [...new Set(recipients.flatMap((r) => r.homeroomGrades))].sort();
  const chipSet = (filter: (r: Recipient) => boolean) => recipients.filter(filter).map((r) => r.id);
  const toggleSet = (ids: string[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allIn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  const isSetSelected = (ids: string[]) => ids.length > 0 && ids.every((id) => selected.has(id));

  const chip = (label: string, ids: string[]) => (
    <button
      key={label}
      type="button"
      onClick={() => toggleSet(ids)}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        isSetSelected(ids)
          ? "bg-emerald-600 border-emerald-600 text-white"
          : "border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700"
      )}
    >
      {label}
      <span className={cn("ml-1", isSetSelected(ids) ? "text-emerald-100" : "text-slate-300")}>
        {ids.length}
      </span>
    </button>
  );

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t("fieldTitle")}</label>
        <input
          name="title"
          required
          maxLength={120}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t("fieldMessage")}</label>
        <textarea
          name="body"
          required
          rows={4}
          maxLength={1000}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
      </div>

      {/* Recipients */}
      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">{t("recipients")}</p>
        <input type="hidden" name="mode" value={mode} />
        <div className="flex gap-2 mb-3">
          {(["all", "pick"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-lg px-3.5 py-2 text-sm font-medium border transition-colors",
                mode === m
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "border-slate-200 text-slate-500 hover:text-slate-700"
              )}
            >
              {m === "all" ? t("allTeachers") : t("pickRecipients")}
            </button>
          ))}
        </div>

        {mode === "pick" && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Smart shortcuts: homeroom teachers + per-specialty sets */}
            <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">
                {t("quickPick")}
              </span>
              {chip(t("homeroomChip"), chipSet((r) => r.homeroomGrades.length > 0))}
              {homeroomYears.map((g) =>
                chip(
                  t("homeroomGradeChip", { grade: gradeLabel(g) }),
                  chipSet((r) => r.homeroomGrades.includes(g))
                )
              )}
              {specialties.map((sp) => chip(sp, chipSet((r) => r.specialty === sp)))}
            </div>
            <div className="p-2 border-b border-slate-100 bg-slate-50/60 flex items-center gap-3">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("filterPlaceholder")}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              {filter.trim() && visible.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleSet(visible.map((v) => v.id))}
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex-shrink-0"
                >
                  {isSetSelected(visible.map((v) => v.id)) ? t("clearVisible") : t("selectVisible")}
                </button>
              )}
              <span className="text-xs font-medium text-slate-500 flex-shrink-0 pr-1">
                {t("selectedCount", { count: selected.size })}
                {selected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="ml-2 text-slate-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
              {visible.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-emerald-50/40 transition-colors"
                >
                  <input
                    type="checkbox"
                    name="to"
                    value={r.id}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="accent-emerald-600 w-4 h-4"
                  />
                  <span className="font-medium text-slate-900">{r.label}</span>
                  {r.sub && <span className="text-xs text-slate-400">{r.sub}</span>}
                </label>
              ))}
              {visible.length === 0 && (
                <p className="px-4 py-3 text-sm text-slate-400">{t("noMatches")}</p>
              )}
            </div>
            {/* keep filtered-out selections in the submission */}
            {[...selected]
              .filter((id) => !visible.some((v) => v.id === id))
              .map((id) => (
                <input key={id} type="hidden" name="to" value={id} />
              ))}
          </div>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}
