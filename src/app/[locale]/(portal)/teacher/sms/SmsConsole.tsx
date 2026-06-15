"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { smsSegmentInfo } from "@/lib/smsText";
import { fmtDisplayDateTime } from "@/lib/dates";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Users, Wallet, Search, Loader2, AlertTriangle, MessageSquare, CheckCircle2 } from "lucide-react";

type Mode = "students" | "group" | "grade" | "school";

const inputCls =
  "w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

export function SmsConsole() {
  const t = useTranslations("sms");
  const utils = trpc.useUtils();

  const [mode, setMode] = useState<Mode>("students");
  const [groupId, setGroupId] = useState("");
  const [grade, setGrade] = useState<number | "">("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");

  const credits = trpc.sms.credits.useQuery(undefined, { staleTime: 60_000 });
  const audiences = trpc.sms.audiences.useQuery();
  const history = trpc.sms.history.useQuery();
  const allStudents = trpc.sms.allStudents.useQuery(undefined, { enabled: mode === "students" });

  // Students grouped under their class heading, narrowed by the optional filter.
  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = (allStudents.data ?? []).filter((s) => !f || s.name.toLowerCase().includes(f));
    const map = new Map<string, { id: string; name: string }[]>();
    for (const s of list) {
      const key = s.group ?? "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ id: s.id, name: s.name });
    }
    return [...map.entries()];
  }, [allStudents.data, filter]);

  function toggleStudent(id: string) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleClass(ids: string[], on: boolean) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      for (const id of ids) on ? next.add(id) : next.delete(id);
      return next;
    });
  }

  // The current audience selection, and whether it is complete enough to send.
  const audience = useMemo(() => {
    if (mode === "students") return { mode, studentIds: [...selectedIds] };
    if (mode === "group") return { mode, groupId };
    if (mode === "grade") return { mode, grade: grade === "" ? undefined : grade };
    return { mode };
  }, [mode, selectedIds, groupId, grade]);

  const audienceReady =
    mode === "school" ||
    (mode === "students" && selectedIds.size > 0) ||
    (mode === "group" && !!groupId) ||
    (mode === "grade" && grade !== "");

  const preview = trpc.sms.preview.useQuery(audience, { enabled: audienceReady });

  const info = smsSegmentInfo(message);
  const canSend =
    audienceReady && message.trim().length > 0 && !info.overLimit && (preview.data?.recipients ?? 0) > 0;

  const send = trpc.sms.send.useMutation({
    onSuccess: ({ sent, failed }) => {
      if (failed === 0) toast.success(t("sentOk", { sent }));
      else toast.warning(t("sentPartial", { sent, failed }));
      // Reset the form so the same recipients aren't accidentally messaged again.
      setMessage("");
      setSelectedIds(new Set());
      setGroupId("");
      setGrade("");
      setFilter("");
      utils.sms.history.invalidate();
      utils.sms.credits.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const modes: { key: Mode; label: string }[] = [
    { key: "students", label: t("modeStudents") },
    { key: "group", label: t("modeGroup") },
    { key: "grade", label: t("modeGrade") },
    { key: "school", label: t("modeSchool") },
  ];

  const recipients = preview.data?.recipients ?? 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" /> {t("title")}
          </h1>
          <p className="text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <Badge variant="outline" className="gap-1.5 h-8 px-3 text-sm">
          <Wallet className="w-4 h-4 text-slate-400" />
          {credits.isLoading
            ? "…"
            : credits.data
              ? t("credits", { n: credits.data.credits })
              : t("creditsUnknown")}
        </Badge>
      </div>

      {/* Audience */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" /> {t("audience")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {modes.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={
                  "h-9 px-3 rounded-lg text-sm font-medium border transition " +
                  (mode === m.key
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")
                }
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "students" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className={inputCls + " pl-9"}
                  />
                </div>
                <span className="text-xs text-slate-500 shrink-0">{t("selectedN", { n: selectedIds.size })}</span>
                {selectedIds.size > 0 && (
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs text-slate-400 hover:text-slate-700 shrink-0"
                  >
                    {t("clear")}
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {allStudents.isLoading ? (
                  <p className="p-3 text-sm text-slate-400">…</p>
                ) : grouped.length === 0 ? (
                  <p className="p-3 text-sm text-slate-400">{t("noResults")}</p>
                ) : (
                  grouped.map(([cls, students]) => {
                    const ids = students.map((s) => s.id);
                    const allOn = ids.every((id) => selectedIds.has(id));
                    return (
                      <div key={cls}>
                        <label className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-xs font-semibold text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-emerald-600"
                            checked={allOn}
                            onChange={(e) => toggleClass(ids, e.target.checked)}
                          />
                          {cls} <span className="font-normal text-slate-400">({students.length})</span>
                        </label>
                        {students.map((s) => (
                          <label
                            key={s.id}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="accent-emerald-600"
                              checked={selectedIds.has(s.id)}
                              onChange={() => toggleStudent(s.id)}
                            />
                            <span className="truncate">{s.name}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {mode === "group" && (
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls + " bg-white"}>
              <option value="">{t("selectGroup")}</option>
              {audiences.data?.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({t("studentsN", { n: g.students })})
                </option>
              ))}
            </select>
          )}

          {mode === "grade" && (
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value === "" ? "" : Number(e.target.value))}
              className={inputCls + " bg-white"}
            >
              <option value="">{t("selectGrade")}</option>
              {audiences.data?.grades.map((g) => (
                <option key={g} value={g}>
                  {t("gradeOption", { grade: g })}
                </option>
              ))}
            </select>
          )}

          {mode === "school" && (
            <p className="text-sm text-slate-600 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              {t("schoolNote", { n: audiences.data?.schoolTotal ?? 0 })}
            </p>
          )}

          {audienceReady && (
            <p className="text-sm text-slate-500">
              {preview.isLoading ? "…" : t("previewCounts", { students: preview.data?.students ?? 0, recipients })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Message */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("message")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder={t("messagePlaceholder")}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
          />
          <p className={"text-xs " + (info.overLimit ? "text-red-600 font-medium" : "text-slate-500")}>
            {t("counter", { chars: info.length, segments: info.segments })}
            {info.overLimit && ` · ${t("overLimit")}`}
          </p>

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <button
                  disabled={!canSend || send.isPending}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {t("send")}
                </button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("confirmBody", { recipients, segments: info.segments })}
                  {mode === "school" && ` ${t("confirmSchool")}`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => send.mutate({ ...audience, message: message.trim() })}
                >
                  {t("confirmSend")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("historyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(history.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-400">{t("noHistory")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.data!.map((h) => (
                <li key={h.id} className="py-2 flex items-start gap-2 text-sm">
                  {h.status === "SENT" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-700 truncate">{h.message}</p>
                    <p className="text-xs text-slate-400">
                      {h.student} · {h.phone} · {fmtDisplayDateTime(h.sentAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
