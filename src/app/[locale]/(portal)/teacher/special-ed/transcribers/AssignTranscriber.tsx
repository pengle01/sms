"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { assignTranscriber, removeTranscriber } from "./actions";

export interface TranscriberChoice {
  staffId: string;
  name: string;
  periods: number | null;
  lessons: number[];
}

/**
 * Pick the transcriber of one student's test from the teachers free in its
 * period(s). With `current`, it changes or removes the one already picked.
 */
export function AssignTranscriber({
  testId,
  studentId,
  options,
  rooms,
  current,
  currentRoom,
}: {
  testId: string;
  studentId: string;
  options: TranscriberChoice[];
  rooms: { name: string; free: boolean }[];
  current?: string;
  currentRoom?: string | null;
}) {
  const t = useTranslations("transcribers");
  const [value, setValue] = useState(current ?? "");
  const [room, setRoom] = useState(currentRoom ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(null);
      const r = await assignTranscriber(testId, studentId, value, room);
      if (!r.ok) setError(r.error);
    });
  const remove = () =>
    startTransition(async () => {
      setError(null);
      await removeTranscriber(testId, studentId);
    });

  if (options.length === 0 && !current) {
    return <p className="text-xs text-amber-700">{t("nobodyFree")}</p>;
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          className="h-8 max-w-[18rem] rounded-md border border-slate-200 bg-white px-2 text-sm"
        >
          <option value="">{t("choose")}</option>
          {options.map((o) => (
            <option key={o.staffId} value={o.staffId}>
              {o.name}
              {o.periods != null ? ` · ${t("optionPeriods", { count: o.periods })}` : ""}
              {" · "}
              {o.lessons.length > 0 ? t("optionLessons", { periods: o.lessons.join(", ") }) : t("optionNoLessons")}
            </option>
          ))}
        </select>
        <select
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          disabled={pending}
          aria-label={t("room")}
          className="h-8 w-36 rounded-md border border-slate-200 bg-white px-2 text-sm"
        >
          <option value="">{t("chooseRoom")}</option>
          <optgroup label={t("roomsFree")}>
            {rooms.filter((r) => r.free).map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </optgroup>
          <optgroup label={t("roomsTaken")}>
            {rooms.filter((r) => !r.free).map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </optgroup>
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending || !value || !room || (value === current && room === (currentRoom ?? ""))}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-40"
        >
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {current ? t("change") : t("assign")}
        </button>
        {current && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            title={t("remove")}
            aria-label={t("remove")}
            className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{t(`assignErr_${error}`)}</p>}
    </div>
  );
}
