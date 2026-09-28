"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, MessageSquare, PlayCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { COMMENT_MAX, noteRequired, type Status } from "@/lib/maintenance";
import { addMaintenanceComment, changeMaintenanceStatus } from "./maintenance-actions";

/**
 * The comment box and the status buttons under a request's timeline. One text
 * area serves both: typed text is posted as a comment, or attached as the note
 * of a status change — required when resolving or reopening.
 */
export function RequestActions({
  requestId,
  status,
  transitions,
}: {
  requestId: string;
  status: Status;
  /** Statuses this person may move the request to. */
  transitions: Status[];
}) {
  const t = useTranslations("maintenance");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const hasText = text.trim() !== "";

  function done(res: { ok: true } | { ok: false; error: string }, success: string) {
    if (res.ok) {
      setText("");
      toast.success(success);
      router.refresh();
    } else {
      toast.error(t(res.error as Parameters<typeof t>[0]));
      if (res.error === "errConflict") router.refresh();
    }
  }

  function comment() {
    startTransition(async () => done(await addMaintenanceComment(requestId, text), t("commentAdded")));
  }

  function move(to: Status) {
    startTransition(async () => done(await changeMaintenanceStatus(requestId, to, text), t("statusChanged")));
  }

  const actionLabel = (to: Status) =>
    to === "IN_PROGRESS" ? t("actionStart")
      : to === "RESOLVED" ? t("actionResolve")
        : status === "RESOLVED" ? t("actionReopen")
          : t("actionBackToOpen");
  const actionIcon = (to: Status) =>
    to === "IN_PROGRESS" ? PlayCircle : to === "RESOLVED" ? CheckCircle2 : RotateCcw;
  const needsNote = transitions.some((to) => noteRequired(status, to));

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={COMMENT_MAX}
        rows={3}
        placeholder={t("commentPlaceholder")}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={comment}
          disabled={!hasText || pending}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
          {t("addComment")}
        </button>
        {transitions.map((to) => {
          const Icon = actionIcon(to);
          const blocked = noteRequired(status, to) && !hasText;
          return (
            <button
              key={to}
              type="button"
              onClick={() => move(to)}
              disabled={blocked || pending}
              title={blocked ? t("noteRequiredHint") : undefined}
              className={
                to === "RESOLVED"
                  ? "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  : "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50"
              }
            >
              <Icon className="w-4 h-4" />
              {actionLabel(to)}
            </button>
          );
        })}
      </div>
      {needsNote && <p className="text-xs text-slate-400">{t("noteRequiredHint")}</p>}
    </div>
  );
}
