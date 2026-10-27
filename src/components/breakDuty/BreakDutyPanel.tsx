"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, X, MessageSquare, Printer, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { breakProgress, type GridRow, type DayBreak } from "@/lib/breakDuty";
import { recordDutyCheck, saveDayReport } from "@/app/[locale]/(portal)/teacher/duty/break-duty-actions";

/**
 * «Εφημερίες εκπαιδευτικών» on the duty desk: for the chosen break, every post
 * and its teachers with Παρών / Απών and a comment; the day's incidents; and
 * the printable report. Recording is for today's on-duty deputies only.
 */
export function BreakDutyPanel({
  dateIso,
  todayIso,
  canRecord,
  breaks,
  defaultBreak,
  rows: initialRows,
  posts,
  absentTeachers,
  dayComments,
  printHref,
}: {
  dateIso: string;
  todayIso: string;
  canRecord: boolean;
  breaks: DayBreak[];
  defaultBreak: number | null;
  rows: GridRow[];
  posts: { code: string; name: string; teachers: string[] }[];
  absentTeachers: string[];
  dayComments: string | null;
  printHref: string;
}) {
  const t = useTranslations("breakDuty");
  const [breakNo, setBreakNo] = useState(defaultBreak ?? breaks[0]?.no ?? 1);
  const [rows, setRows] = useState(initialRows);
  const [openComment, setOpenComment] = useState<string | null>(null);
  const [day, setDay] = useState(dayComments ?? "");
  const [pending, start] = useTransition();
  const absent = new Set(absentTeachers);

  const errorText = (e: string) => t(`err_${e}` as "err_unknown");

  const patch = (postCode: string, teacherName: string, change: { present?: boolean; comment?: string | null }) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.postCode !== postCode || r.teacherName !== teacherName) return r;
        const cur = r.cells[breakNo] ?? { present: null, comment: null, checkedBy: null };
        return {
          ...r,
          cells: {
            ...r.cells,
            [breakNo]: {
              ...cur,
              ...(change.present !== undefined ? { present: change.present } : {}),
              ...(change.comment !== undefined ? { comment: change.comment } : {}),
            },
          },
        };
      }),
    );

  const record = (postCode: string, teacherName: string, change: { present?: boolean; comment?: string | null }) => {
    const before = rows;
    patch(postCode, teacherName, change);
    start(async () => {
      const res = await recordDutyCheck({ dateIso, breakNo, postCode, teacherName, ...change });
      if (!res.ok) {
        setRows(before);
        toast.error(errorText(res.error));
      }
    });
  };

  if (breaks.length === 0) return <p className="text-sm text-slate-400">{t("noSchoolDay")}</p>;
  if (posts.length === 0) return <p className="text-sm text-slate-400">{t("noProgramme")}</p>;

  const progress = breakProgress(rows, breakNo);
  const rowsByPost = new Map<string, GridRow[]>();
  for (const r of rows) rowsByPost.set(r.postCode, [...(rowsByPost.get(r.postCode) ?? []), r]);

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Break and print — the day comes from the page's day bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {breaks.map((b, i) => {
            const p = breakProgress(rows, b.no);
            return (
              <button
                key={b.no}
                type="button"
                onClick={() => setBreakNo(b.no)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium text-left",
                  i > 0 && "border-l border-slate-200",
                  b.no === breakNo ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                <span className="block">{t("breakLabel", { n: b.no })}</span>
                <span className={cn("block tabular-nums", b.no === breakNo ? "text-slate-300" : "text-slate-400")}>
                  {b.from}–{b.to} · {p.checked}/{p.total}
                </span>
              </button>
            );
          })}
        </div>
        <a
          href={printHref}
          target="_blank"
          rel="noopener"
          className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
        >
          <Printer className="w-4 h-4" />
          {t("printReport")}
        </a>
      </div>

      <p className="text-xs text-slate-500">
        {t("progress", { checked: progress.checked, total: progress.total, absent: progress.absent })}
        {!canRecord && <span className="ml-2 font-medium text-amber-700">{dateIso === todayIso ? t("readOnlyNotOnDuty") : t("readOnlyPast")}</span>}
      </p>

      {/* Posts */}
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {posts.map((p) => {
          const prow = rowsByPost.get(p.code) ?? [];
          return (
            <div key={p.code} className="px-4 py-2.5">
              <p className="text-sm font-semibold text-slate-800">
                <span className="text-slate-400 mr-1.5 tabular-nums">{p.code}</span>
                {p.name}
              </p>
              {prow.length === 0 ? (
                <p className="text-xs text-slate-400 mt-1">{t("noTeachers")}</p>
              ) : (
                prow.map((r) => {
                  const cell = r.cells[breakNo];
                  const key = `${r.postCode}|${r.teacherName}`;
                  return (
                    <div key={key} className="mt-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-slate-700 min-w-[11rem]">{r.teacherName}</span>
                        {absent.has(r.teacherName) && (
                          <span className="text-[11px] font-medium text-amber-700">{t("absentToday")}</span>
                        )}
                        <div className="ml-auto flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!canRecord || pending}
                            onClick={() => record(r.postCode, r.teacherName, { present: true })}
                            className={cn(
                              "inline-flex items-center gap-1 h-8 px-3 rounded-lg border text-xs font-semibold disabled:cursor-not-allowed",
                              cell?.present === true
                                ? "border-emerald-500 bg-emerald-600 text-white"
                                : "border-slate-200 text-slate-500 enabled:hover:border-emerald-400 enabled:hover:text-emerald-700",
                            )}
                          >
                            <Check className="w-3.5 h-3.5" />
                            {t("present")}
                          </button>
                          <button
                            type="button"
                            disabled={!canRecord || pending}
                            onClick={() => record(r.postCode, r.teacherName, { present: false })}
                            className={cn(
                              "inline-flex items-center gap-1 h-8 px-3 rounded-lg border text-xs font-semibold disabled:cursor-not-allowed",
                              cell?.present === false
                                ? "border-red-500 bg-red-600 text-white"
                                : "border-slate-200 text-slate-500 enabled:hover:border-red-400 enabled:hover:text-red-700",
                            )}
                          >
                            <X className="w-3.5 h-3.5" />
                            {t("absent")}
                          </button>
                          <button
                            type="button"
                            disabled={!canRecord && !cell?.comment}
                            onClick={() => setOpenComment(openComment === key ? null : key)}
                            title={t("comment")}
                            aria-label={t("comment")}
                            className={cn(
                              "h-8 w-8 inline-flex items-center justify-center rounded-lg border disabled:opacity-40",
                              cell?.comment ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-400 hover:text-slate-700",
                            )}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {cell?.comment && openComment !== key && (
                        <p className="mt-0.5 text-xs text-amber-800">{cell.comment}</p>
                      )}
                      {openComment === key && (
                        <CommentBox
                          initial={cell?.comment ?? ""}
                          readOnly={!canRecord}
                          onSave={(text) => {
                            record(r.postCode, r.teacherName, { comment: text });
                            setOpenComment(null);
                          }}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      {/* The day's incidents */}
      <div className="space-y-2">
        <label htmlFor="break-duty-day" className="text-sm font-semibold text-slate-800">{t("dayIncidents")}</label>
        <textarea
          id="break-duty-day"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          readOnly={!canRecord}
          rows={3}
          placeholder={canRecord ? t("dayIncidentsPlaceholder") : ""}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 read-only:bg-slate-50"
        />
        {canRecord && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveDayReport({ dateIso, comments: day });
                if (res.ok) toast.success(t("saved"));
                else toast.error(errorText(res.error));
              })
            }
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("saveIncidents")}
          </button>
        )}
      </div>
    </div>
  );
}

function CommentBox({ initial, readOnly, onSave }: { initial: string; readOnly: boolean; onSave: (text: string) => void }) {
  const t = useTranslations("breakDuty");
  const [text, setText] = useState(initial);
  return (
    <div className="mt-1.5 flex items-start gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={readOnly}
        rows={2}
        placeholder={t("commentPlaceholder")}
        className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 read-only:bg-slate-50"
      />
      {!readOnly && (
        <button
          type="button"
          onClick={() => onSave(text)}
          className="h-8 px-3 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700"
        >
          {t("save")}
        </button>
      )}
    </div>
  );
}
