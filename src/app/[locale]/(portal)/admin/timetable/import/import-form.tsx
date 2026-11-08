"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  importSchedule,
  previewTeacherHandover,
  type HandoverCandidate,
  type HandoverPreview,
} from "./actions";
import type { HandoverDesignation } from "@/lib/teacherHandover";

type Choice = { replacement: string; designations: HandoverDesignation[]; deactivateLogin: boolean };

export function ScheduleImportForm() {
  const t = useTranslations("adminTimetable");
  const [result, action, importing] = useActionState(importSchedule, null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  // A file whose import would remove teachers waits here for the admin's choices.
  const [draft, setDraft] = useState<{ file: File; preview: HandoverPreview; choices: Record<string, Choice> } | null>(null);
  const pending = importing || checking;

  const runImport = (file: File, handover?: string) => {
    const fd = new FormData();
    fd.set("file", file);
    if (handover) fd.set("handover", handover);
    startTransition(() => action(fd));
    if (inputRef.current) inputRef.current.value = "";
  };

  const onFile = async (file: File) => {
    setChecking(true);
    setDraft(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const preview = await previewTeacherHandover(fd);
      if (preview.left.length === 0) {
        runImport(file);
      } else {
        setDraft({
          file,
          preview,
          choices: Object.fromEntries(
            preview.left.map((l) => [
              l.name,
              { replacement: l.suggestion ?? "", designations: l.designations, deactivateLogin: l.canDeactivate },
            ]),
          ),
        });
      }
    } finally {
      setChecking(false);
    }
  };

  const confirm = () => {
    if (!draft) return;
    const handover = draft.preview.left.map((l) => {
      const c = draft.choices[l.name]!;
      return {
        left: l.name,
        replacement: c.replacement || null,
        designations: c.designations,
        deactivateLogin: c.deactivateLogin,
      };
    });
    runImport(draft.file, JSON.stringify(handover));
    setDraft(null);
  };

  const setChoice = (name: string, patch: Partial<Choice>) =>
    setDraft((d) => (d ? { ...d, choices: { ...d.choices, [name]: { ...d.choices[name]!, ...patch } } } : d));

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <label
        className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-12 cursor-pointer transition-colors
          ${pending
            ? "border-slate-200 bg-slate-50 pointer-events-none"
            : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/40"}`}
      >
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".xlsx,.xls"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
          disabled={pending}
        />
        {pending ? (
          <>
            <svg className="animate-spin w-8 h-8 text-emerald-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm text-slate-500 font-medium">{t("importing")}</p>
          </>
        ) : (
          <>
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">{t("clickToUpload")}</p>
              <p className="text-xs text-slate-400 mt-1">{t("fileTypesHint")}</p>
            </div>
          </>
        )}
      </label>

      {draft && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-amber-900">{t("handoverTitle", { count: draft.preview.left.length })}</p>
            <p className="text-xs text-amber-800 mt-1">{t("handoverHint")}</p>
            <p className="text-xs text-amber-800 mt-1">{t("handoverSamePerson")}</p>
          </div>
          <div className="space-y-3">
            {draft.preview.left.map((l) => (
              <HandoverRow
                key={l.name}
                candidate={l}
                names={draft.preview.names}
                choice={draft.choices[l.name]!}
                onChange={(patch) => setChoice(l.name, patch)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirm}
              className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
            >
              {t("handoverConfirm")}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              {t("handoverCancel")}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {result.success && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-semibold text-green-800 mb-3">{t("importComplete")}</p>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Stat label={t("statSlotsCreated")}  value={result.slotsCreated} />
                <Stat label={t("statSlotsUpdated")}  value={result.slotsUpdated} />
                <Stat label={t("statSlotsLinked")} value={result.slotsLinked} />
                {result.slotsReleased > 0 && <Stat label={t("statSlotsReleased")} value={result.slotsReleased} />}
                <Stat label={t("statStaffCreated")} value={result.staffProfilesCreated} />
                <Stat label={t("statCoursesCreated")}  value={result.coursesCreated} />
                <Stat label={t("statGroupsCreated")}   value={result.groupsCreated} />
                <Stat label={t("statSlotsRemoved")}   value={result.slotsRemoved} />
                <Stat label={t("statSlotsRetired")}   value={result.slotsRetired} />
                <Stat label={t("statStaffLeft")}      value={result.staffLeft} />
                {result.handovers > 0 && <Stat label={t("statHandovers")} value={result.handovers} />}
                {result.handovers > 0 && <Stat label={t("statTestsHandedOver")} value={result.testsHandedOver} />}
              </dl>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800 mb-2">
                {t("warningsCount", { count: result.errors.length })}
              </p>
              <ul className="space-y-1 max-h-64 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-700 font-mono">{e}</li>
                ))}
              </ul>
            </div>
          )}

          {!result.success && result.errors.length === 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{t("importFailed")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HandoverRow({
  candidate: l,
  names,
  choice,
  onChange,
}: {
  candidate: HandoverCandidate;
  names: string[];
  choice: Choice;
  onChange: (patch: Partial<Choice>) => void;
}) {
  const t = useTranslations("adminTimetable");
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{l.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("handoverHolds", { homegroups: l.homegroups, tests: l.tests, dutyPosts: l.dutyPosts, rooms: l.rooms })}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          {t("handoverReplacedBy")}
          <select
            value={choice.replacement}
            onChange={(e) => onChange({ replacement: e.target.value })}
            className="h-8 max-w-56 px-2 rounded-lg border border-slate-200 bg-white text-sm"
          >
            <option value="">{t("handoverNone")}</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      {choice.replacement && l.designations.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {l.designations.map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={choice.designations.includes(d)}
                onChange={(e) =>
                  onChange({
                    designations: e.target.checked
                      ? [...choice.designations, d]
                      : choice.designations.filter((x) => x !== d),
                  })
                }
              />
              {t(`handoverDesignation_${d}`)}
            </label>
          ))}
        </div>
      )}
      {l.canDeactivate && (
        <label className="flex items-center gap-1.5 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={choice.deactivateLogin}
            onChange={(e) => onChange({ deactivateLogin: e.target.checked })}
          />
          {t("handoverDeactivate")}
        </label>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-green-100 px-3 py-2 text-center">
      <p className="text-xl font-bold text-green-700">{value}</p>
      <p className="text-xs text-green-600 mt-0.5">{label}</p>
    </div>
  );
}
