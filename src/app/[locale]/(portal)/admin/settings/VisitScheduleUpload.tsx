"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Upload } from "lucide-react";
import {
  previewVisitSchedule,
  saveVisitSchedule,
  type VisitPreview,
  type VisitSaveResult,
} from "./visit-schedule-actions";

type Ready = Extract<VisitPreview, { ok: true }>;

/** Choose the file, check the matches, save. Nothing is written before «Αποθήκευση». */
export function VisitScheduleUpload() {
  const t = useTranslations("visitHours");
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<{ file: File; preview: Ready; choices: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<VisitSaveResult, { ok: true }> | null>(null);

  const onFile = (file: File) => {
    setError(null);
    setResult(null);
    setDraft(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const preview = await previewVisitSchedule(fd);
      if (!preview.ok) {
        setError(t(`err_${preview.error}`));
        return;
      }
      setDraft({
        file,
        preview,
        choices: Object.fromEntries(preview.entries.map((e) => [e.key, e.staffProfileId ?? ""])),
      });
    });
  };

  const save = () => {
    if (!draft) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", draft.file);
      fd.set("choices", JSON.stringify(draft.choices));
      const saved = await saveVisitSchedule(fd);
      if (!saved.ok) {
        setError(t(`err_${saved.error}`));
        return;
      }
      setResult(saved);
      setDraft(null);
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  const rows = draft?.preview.entries ?? [];
  const row = (e: Ready["entries"][number]) => (
    <div key={e.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between py-1.5">
      <div className="min-w-0 text-sm">
        <span className="font-medium text-slate-800">{e.fileName}</span>
        {e.section && <span className="text-xs text-slate-400"> · {e.section}</span>}
        <span className="block text-xs text-slate-500">{e.slotText}</span>
      </div>
      <select
        value={draft!.choices[e.key] ?? ""}
        onChange={(ev) => setDraft((d) => (d ? { ...d, choices: { ...d.choices, [e.key]: ev.target.value } } : d))}
        className="h-8 w-full sm:w-56 px-2 rounded-lg border border-slate-200 bg-white text-sm"
      >
        <option value="">{t("noMatch")}</option>
        {draft!.preview.staff.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
  const needChoice = rows.filter((e) => !e.staffProfileId);
  const matched = rows.filter((e) => e.staffProfileId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
          className="max-w-full text-sm file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:text-sm file:font-medium"
        />
        {pending && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>
      <p className="text-xs text-slate-500">{t("uploadHint")}</p>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {result && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {t("saved", { count: result.saved, unmatched: result.unmatched })}
        </p>
      )}
      {draft && (
        <div className="rounded-lg border border-slate-200 p-3 space-y-3">
          <p className="text-sm font-medium text-slate-800">
            {t("previewSummary", { matched: matched.length, unmatched: needChoice.length })}
          </p>
          {draft.preview.unreadable.length > 0 && (
            <p className="text-xs text-amber-700">
              {t("unreadable", { count: draft.preview.unreadable.length })}: {draft.preview.unreadable.join("; ")}
            </p>
          )}
          {needChoice.length > 0 && (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">{needChoice.map(row)}</div>
          )}
          <details>
            <summary className="cursor-pointer text-sm text-slate-600">{t("reviewMatched", { count: matched.length })}</summary>
            <div className="mt-2 divide-y divide-slate-100 max-h-96 overflow-y-auto">{matched.map(row)}</div>
          </details>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t("save")}
          </button>
        </div>
      )}
    </div>
  );
}
