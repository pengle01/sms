"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { NotebookPen, Lock, Loader2, Check } from "lucide-react";
import { LESSON_NOTE_MAX } from "@/lib/lessonNotes";
import { saveLessonNote } from "./actions";

/**
 * «Σημείωση μαθήματος» under the attendance list — private to the teacher who
 * writes it, saved on its own (before or after the attendance). It also saves
 * when the cursor leaves the box, so pressing the attendance save (which
 * navigates away) never loses a typed note.
 */
export function LessonNoteCard({
  locale,
  groupId,
  period,
  date,
  initial,
}: {
  locale: string;
  groupId: string;
  period: number;
  date: string;
  initial: string;
}) {
  const t = useTranslations("lessonNotes");
  const [body, setBody] = useState(initial);
  const savedRef = useRef(initial.trim());
  const [saved, setSaved] = useState(initial.trim());
  const [pending, startTransition] = useTransition();
  const dirty = body.trim() !== saved;

  const save = (quiet: boolean) => {
    if (body.trim() === savedRef.current) return;
    const value = body;
    startTransition(async () => {
      const res = await saveLessonNote({ groupId, period, date, body: value });
      if (res.ok) {
        savedRef.current = value.trim();
        setSaved(value.trim());
        if (!quiet) toast.success(t(res.saved ? "savedToast" : "deletedToast"));
      } else {
        toast.error(t(res.error === "tooLong" ? "errTooLong" : "errSave"));
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <NotebookPen className="w-4 h-4 text-slate-400" />
          {t("cardTitle")}
        </p>
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Lock className="w-3 h-3" />
          {t("privateHint")}
        </span>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => save(true)}
        rows={3}
        maxLength={LESSON_NOTE_MAX}
        placeholder={t("placeholder")}
        className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <div className="flex items-center justify-between gap-3">
        <Link href={`/${locale}/teacher/lesson-notes`} className="text-xs text-emerald-700 hover:underline">
          {t("allNotesLink")}
        </Link>
        <button
          type="button"
          onClick={() => save(false)}
          disabled={pending || !dirty}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : !dirty && saved ? <Check className="w-4 h-4" /> : null}
          {!dirty && saved ? t("saved") : t("save")}
        </button>
      </div>
    </div>
  );
}
