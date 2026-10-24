"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Send, Loader2, Save, MoreHorizontal, Users } from "lucide-react";
import { saveRecipientGroup, deleteRecipientGroup } from "./recipient-group-actions";
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
type HomegroupTeachers = { id: string; name: string; teacherIds: string[] };

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
  const [homegroupId, setHomegroupId] = useState("");
  const [groupBusy, startGroup] = useTransition();
  const ta = useTranslations("attachments");
  const [mode, setMode] = useState<"all" | "pick">("all");
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
  const addSet = (ids: string[]) => setSelected((prev) => new Set([...prev, ...ids]));

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
                  t("homeroomGradeChip", { n: g }),
                  chipSet((r) => r.homeroomGrades.includes(g))
                )
              )}
              {specialties.map((sp) => chip(sp, chipSet((r) => r.specialty === sp)))}
            </div>

            {/* «Καθηγητές τμήματος» — everyone who teaches any student of a homegroup */}
            {homegroups.length > 0 && (
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">{t("homegroupTeachers")}</span>
                <select
                  value={homegroupId}
                  onChange={(e) => setHomegroupId(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="">{t("chooseHomegroup")}</option>
                  {homegroups.map((h) => (
                    <option key={h.id} value={h.id}>{`${h.name} · ${h.teacherIds.length}`}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!homegroupId}
                  onClick={() => addSet(homegroups.find((h) => h.id === homegroupId)?.teacherIds ?? [])}
                  className="inline-flex items-center gap-1 h-8 rounded-lg border border-emerald-300 bg-white px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                >
                  <Users className="w-3.5 h-3.5" />
                  {t("addTeachers")}
                </button>
              </div>
            )}

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
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {uploading ? ta("uploading") : pending ? t("sending") : t("send")}
      </button>
    </form>
  );
}
