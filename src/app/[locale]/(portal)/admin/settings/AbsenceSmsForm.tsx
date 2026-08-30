"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MessageSquare, MessageSquareOff } from "lucide-react";
import {
  ABSENCE_SMS_TEMPLATE_MAX,
  isValidCutoff,
  renderAbsenceSms,
  type AbsenceSmsConfig,
} from "@/lib/absenceSms";
import { smsSegmentInfo } from "@/lib/smsText";
import { EditControls } from "./EditControls";
import { saveAbsenceSms } from "./actions";

export function AbsenceSmsForm({
  initial,
  longestStudentName,
}: {
  initial: AbsenceSmsConfig;
  /** The worst case the school actually has, so the cost readout tells the truth. */
  longestStudentName: string;
}) {
  const t = useTranslations("adminSettings");
  const router = useRouter();
  const [value, setValue] = useState<AbsenceSmsConfig>(initial);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Measured against a real message, not the raw template: the placeholders are
  // shorter than the names that replace them, and Greek costs 70 chars per SMS.
  const preview = renderAbsenceSms(value.template, {
    name: longestStudentName,
    date: "08/09/25",
  });
  const seg = smsSegmentInfo(preview);

  const error = !editing
    ? null
    : !value.template.trim()
      ? t("absenceSmsErrTemplate")
      : !isValidCutoff(value.cutoff)
        ? t("absenceSmsErrCutoff")
        : seg.overLimit
          ? t("absenceSmsErrTooLong")
          : null;

  function save() {
    startTransition(async () => {
      const res = await saveAbsenceSms(value);
      if (res.ok) {
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">{t("absenceSmsIntro")}</p>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{t("absenceSmsSend")}</span>
        {editing ? (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(e) => setValue((v) => ({ ...v, enabled: e.target.checked }))}
              className="accent-emerald-600 w-4 h-4"
            />
            <span className="text-slate-600">{t("enabled")}</span>
          </label>
        ) : value.enabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-2.5 py-1">
            <MessageSquare className="w-3 h-3" />
            {t("enabled")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-500 text-xs px-2.5 py-1">
            <MessageSquareOff className="w-3 h-3" />
            {t("disabled")}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-sm font-medium text-slate-700">{t("absenceSmsCutoff")}</span>
          <p className="text-xs text-slate-400 mt-0.5 max-w-xs">{t("absenceSmsCutoffHint")}</p>
        </div>
        {editing ? (
          <input
            type="time"
            value={value.cutoff}
            onChange={(e) => setValue((v) => ({ ...v, cutoff: e.target.value }))}
            className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        ) : (
          <span className="text-sm font-mono text-slate-600">{value.cutoff}</span>
        )}
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-slate-700">{t("absenceSmsTemplate")}</span>
        {editing ? (
          <textarea
            value={value.template}
            onChange={(e) => setValue((v) => ({ ...v, template: e.target.value }))}
            rows={3}
            maxLength={ABSENCE_SMS_TEMPLATE_MAX}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        ) : (
          <p className="text-sm text-slate-600 whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
            {value.template}
          </p>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs text-slate-400">{t("absenceSmsPlaceholders")}</p>
          <p
            className={
              "text-xs font-medium flex-shrink-0 " +
              (seg.overLimit ? "text-red-600" : seg.segments > 1 ? "text-amber-600" : "text-slate-400")
            }
          >
            {t("absenceSmsSegments", {
              count: seg.segments,
              chars: seg.length,
              limit: seg.perSegment,
            })}
          </p>
        </div>
        <p className="text-xs text-slate-400">{t("absenceSmsCostHint")}</p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <EditControls
        editing={editing}
        pending={pending}
        saved={saved}
        canSave={!error}
        onEdit={() => setEditing(true)}
        onCancel={() => {
          setValue(initial);
          setEditing(false);
        }}
        onSave={save}
      />
    </div>
  );
}
