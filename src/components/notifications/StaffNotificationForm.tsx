"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Send, Loader2, Save, MoreHorizontal } from "lucide-react";
import { saveRecipientGroup, deleteRecipientGroup } from "./recipient-group-actions";
import { classTeacherIds, homeroomTeacherIds, homegroupsByGrade } from "@/lib/recipientGroups";
import { AttachmentPicker, uploadAttachments } from "@/components/attachments/AttachmentPicker";

type Recipient = {
  id: string;
  label: string;
  sub: string | null;
  specialty: string | null;
  homeroomGrades: number[];
};

/** One of the sender's saved groups («Οι ομάδες μου»). */
type SavedGroup = { id: string; name: string; memberIds: string[] };
/** «Καθηγητές τμήματος»: everyone who teaches any student of the homegroup. */
type HomegroupTeachers = { id: string; name: string; grade: number | null; teacherIds: string[] };

/**
 * Who gets it: everyone; the teachers of chosen classes; the homeroom teachers
 * of chosen years; or a hand-picked list. The middle two are sent as a picked
 * list — the server resolves and checks the ids either way.
 */
type Mode = "all" | "class" | "homeroom" | "pick";
const MODES: Mode[] = ["all", "class", "homeroom", "pick"];

export function StaffNotificationForm({
  recipients,
  groups = [],
  homegroups = [],
  action,
}: {
  recipients: Recipient[];
  groups?: SavedGroup[];
  homegroups?: HomegroupTeachers[];
  action: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("staffNotify");
  const router = useRouter();
  const [classIds, setClassIds] = useState<Set<string>>(new Set());
  const [years, setYears] = useState<Set<number>>(new Set());
  const [groupBusy, startGroup] = useTransition();
  const ta = useTranslations("attachments");
  const [mode, setMode] = useState<Mode>("all");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // The attachments are uploaded before the action runs — server actions cap
  // request bodies at 1 MB, far under what a set of files may be.
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    setUploading(true);
    const fileIds = await uploadAttachments(files, "notification", ta);
    setUploading(false);
    if (fileIds === null) return;
    for (const id of fileIds) formData.append("fileId", id);

    startTransition(async () => {
      await action(formData);
    });
  }

  const busy = uploading || pending;

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

  // «Καθηγητές τμήματος» / «Υπεύθυνοι τμημάτων»: who the chosen classes / years add up to.
  const toggleIn = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };
  const modeIds =
    mode === "class" ? classTeacherIds(homegroups, classIds) : mode === "homeroom" ? homeroomTeacherIds(recipients, years) : [];
  const modeNames = recipients.filter((r) => modeIds.includes(r.id)).map((r) => r.label);
  const nothingChosen = (mode === "class" || mode === "homeroom") && modeIds.length === 0;

  // Saving / updating / deleting a group keeps the current selection; the page
  // refreshes so the chips show the stored groups.
  const groupAction = (run: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    startGroup(async () => {
      const res = await run();
      if (res.ok) {
        toast.success(done);
        router.refresh();
      } else {
        toast.error(t(res.error as "err_groupName"));
      }
    });
  const saveAsGroup = () => {
    const name = window.prompt(t("groupNamePrompt"));
    if (name === null) return;
    groupAction(() => saveRecipientGroup(name, [...selected]), t("groupSaved"));
  };

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
    <form onSubmit={onSubmit} className="space-y-5">
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
        <input type="hidden" name="mode" value={mode === "all" ? "all" : "pick"} />
        <div className="flex flex-wrap gap-2 mb-3">
          {MODES.filter((m) => (m === "class" ? homegroups.length > 0 : m === "homeroom" ? homeroomYears.length > 0 : true)).map((m) => (
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
              {m === "all" ? t("allTeachers") : m === "class" ? t("modeClass") : m === "homeroom" ? t("modeHomeroom") : t("pickRecipients")}
            </button>
          ))}
        </div>

        {/* «Καθηγητές τμήματος»: classes by year; everyone who teaches any of them */}
        {mode === "class" && (
          <div className="rounded-xl border border-slate-200 p-3 space-y-2.5">
            <p className="text-xs text-slate-500">{t("classHint")}</p>
            {homegroupsByGrade(homegroups).map(([grade, hs]) => (
              <div key={grade} className="flex flex-wrap items-center gap-1.5">
                <span className="w-16 text-xs font-semibold text-slate-400">{grade ? t("yearLong", { n: grade }) : ""}</span>
                {hs.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setClassIds((s) => toggleIn(s, h.id))}
                    aria-pressed={classIds.has(h.id)}
                    className={cn(
                      "h-8 px-3 rounded-lg border text-sm font-medium transition-colors",
                      classIds.has(h.id)
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700",
                    )}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* «Υπεύθυνοι τμημάτων»: the homeroom teachers of the chosen years */}
        {mode === "homeroom" && (
          <div className="rounded-xl border border-slate-200 p-3 space-y-2.5">
            <p className="text-xs text-slate-500">{t("homeroomHint")}</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setYears(years.size === homeroomYears.length ? new Set() : new Set(homeroomYears))}
                aria-pressed={years.size === homeroomYears.length}
                className={cn(
                  "h-8 px-3 rounded-lg border text-sm font-medium transition-colors",
                  years.size === homeroomYears.length
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700",
                )}
              >
                {t("homeroomAllYears")}
              </button>
              {homeroomYears.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setYears((s) => toggleIn(s, g))}
                  aria-pressed={years.has(g)}
                  className={cn(
                    "h-8 px-3 rounded-lg border text-sm font-medium transition-colors",
                    years.has(g)
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700",
                  )}
                >
                  {t("yearLong", { n: g })}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Who it goes to, before sending */}
        {(mode === "class" || mode === "homeroom") && (
          <div className="mt-2 text-sm">
            {modeIds.length === 0 ? (
              <p className="text-slate-400">{mode === "class" ? t("chooseClasses") : t("chooseYears")}</p>
            ) : (
              <>
                <p className="font-medium text-slate-700">{t("recipientsCount", { count: modeIds.length })}</p>
                <p className="text-xs text-slate-500 mt-0.5">{modeNames.join(" · ")}</p>
              </>
            )}
            {modeIds.map((id) => (
              <input key={id} type="hidden" name="to" value={id} />
            ))}
          </div>
        )}

        {mode === "pick" && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Smart shortcuts: per-specialty sets (homeroom teachers have their own mode) */}
            <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">
                {t("quickPick")}
              </span>
              {specialties.map((sp) => chip(sp, chipSet((r) => r.specialty === sp)))}
            </div>

            {/* «Οι ομάδες μου» — the sender's own saved groups */}
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">{t("myGroups")}</span>
              {groups.map((g) => (
                <span key={g.id} className="inline-flex items-center">
                  {chip(g.name, g.memberIds)}
                  <details className="relative">
                    <summary
                      aria-label={g.name}
                      className="list-none cursor-pointer px-1 text-slate-400 hover:text-slate-700 [&::-webkit-details-marker]:hidden"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </summary>
                    <div className="absolute z-10 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                      <button
                        type="button"
                        disabled={groupBusy || selected.size === 0}
                        onClick={() => groupAction(() => saveRecipientGroup(g.name, [...selected], g.id), t("groupSaved"))}
                        className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        {t("updateGroup")}
                      </button>
                      <button
                        type="button"
                        disabled={groupBusy}
                        onClick={() => {
                          if (window.confirm(t("deleteGroupConfirm", { name: g.name }))) {
                            groupAction(() => deleteRecipientGroup(g.id), t("groupDeleted"));
                          }
                        }}
                        className="w-full rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        {t("deleteGroup")}
                      </button>
                    </div>
                  </details>
                </span>
              ))}
              <button
                type="button"
                disabled={groupBusy || selected.size === 0}
                onClick={saveAsGroup}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-40"
              >
                {groupBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {t("saveAsGroup")}
              </button>
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

      {/* Attachment */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {ta("attachmentLabel")}
        </label>
        <AttachmentPicker files={files} onChange={setFiles} />
      </div>

      <button
        type="submit"
        disabled={busy || nothingChosen}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {uploading ? ta("uploading") : pending ? t("sending") : t("send")}
      </button>
    </form>
  );
}
