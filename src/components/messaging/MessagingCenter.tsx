"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/trpc/client";
import { useTranslations } from "next-intl";
import { fmtDisplayDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { MessageSquare, Plus, Send, ChevronLeft, Eye, Loader2 } from "lucide-react";

// Parent/student ↔ staff messaging. mode "family" lets the user start threads;
// mode "staff" is reply-only with an extra read-only oversight tab.
export function MessagingCenter({ mode }: { mode: "family" | "staff" }) {
  const t = useTranslations("messages");
  const utils = trpc.useUtils();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [tab, setTab] = useState<"inbox" | "oversight">("inbox");
  const [replyText, setReplyText] = useState("");

  const list = trpc.messages.list.useQuery(undefined, {
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });
  const oversight = trpc.messages.oversight.useQuery(undefined, {
    enabled: mode === "staff",
    refetchInterval: 30000,
  });
  const recipients = trpc.messages.recipients.useQuery(undefined, {
    enabled: mode === "family",
  });
  const thread = trpc.messages.thread.useQuery(
    { conversationId: selectedId! },
    { enabled: !!selectedId, refetchInterval: 15000, refetchOnWindowFocus: true }
  );

  // Opening a thread marks it read server-side — refresh badges/list.
  useEffect(() => {
    if (thread.data?.id) {
      utils.messages.list.invalidate();
      utils.messages.unreadCount.invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.data?.id, thread.dataUpdatedAt]);

  const reply = trpc.messages.reply.useMutation({
    onSuccess: () => {
      setReplyText("");
      utils.messages.thread.invalidate();
      utils.messages.list.invalidate();
      utils.messages.unreadCount.invalidate();
    },
  });

  const openThread = (id: string) => {
    setSelectedId(id);
    setComposing(false);
  };
  const backToList = () => {
    setSelectedId(null);
    setComposing(false);
  };

  const showRightPane = composing || !!selectedId;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-emerald-600" />
          {t("title")}
        </h2>
        {mode === "family" && (
          <button
            onClick={() => {
              setComposing(true);
              setSelectedId(null);
            }}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" />
            {t("newMessage")}
          </button>
        )}
      </div>

      <div className="flex gap-4 rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[28rem]">
        {/* Left — list */}
        <div
          className={cn(
            "w-full md:w-80 md:border-r border-slate-100 flex-shrink-0 flex flex-col",
            showRightPane && "hidden md:flex"
          )}
        >
          {mode === "staff" && (
            <div className="flex border-b border-slate-100 text-sm">
              {(["inbox", "oversight"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "flex-1 py-2.5 font-medium transition-colors",
                    tab === k ? "text-emerald-700 border-b-2 border-emerald-600" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {t(k)}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {tab === "inbox" ? (
              list.isLoading ? (
                <Loading />
              ) : (list.data ?? []).length === 0 ? (
                <Empty label={t("empty")} />
              ) : (
                list.data!.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openThread(c.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors",
                      selectedId === c.id && "bg-emerald-50/50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {c.unread && <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />}
                      <span className={cn("text-sm truncate", c.unread ? "font-semibold text-slate-900" : "text-slate-700")}>
                        {c.counterpart}
                      </span>
                      <span className="ml-auto text-[11px] text-slate-400 flex-shrink-0">
                        {fmtDisplayDateTime(c.lastMessageAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{t("about", { name: c.student })}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{c.preview}</p>
                  </button>
                ))
              )
            ) : oversight.isLoading ? (
              <Loading />
            ) : (oversight.data ?? []).length === 0 ? (
              <Empty label={t("empty")} />
            ) : (
              oversight.data!.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openThread(c.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors",
                    selectedId === c.id && "bg-emerald-50/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-700 truncate">
                      {c.family} → {c.staff}
                    </span>
                    <span className="ml-auto text-[11px] text-slate-400 flex-shrink-0">
                      {fmtDisplayDateTime(c.lastMessageAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{t("about", { name: c.student })}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{c.preview}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right — thread or compose */}
        <div className={cn("flex-1 flex flex-col min-w-0", !showRightPane && "hidden md:flex")}>
          {composing ? (
            <Composer
              recipients={recipients.data ?? []}
              loading={recipients.isLoading}
              onSent={(id) => {
                setComposing(false);
                setSelectedId(id);
                utils.messages.list.invalidate();
              }}
              onCancel={backToList}
            />
          ) : !selectedId ? (
            <div className="hidden md:flex flex-1 items-center justify-center text-sm text-slate-400">
              {t("selectConversation")}
            </div>
          ) : thread.isLoading || !thread.data ? (
            <Loading />
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <button onClick={backToList} className="md:hidden text-slate-500">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {thread.data.subject || thread.data.staffName}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {t("about", { name: thread.data.student })}
                    {" · "}
                    {thread.data.starterName} ↔ {thread.data.staffName}
                  </p>
                </div>
                {thread.data.viewerIsOversight && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 flex-shrink-0">
                    <Eye className="w-3 h-3" /> {t("oversightNote")}
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {thread.data.messages.map((m) => (
                  <div key={m.id} className={cn("flex flex-col max-w-[80%]", m.mine ? "ml-auto items-end" : "items-start")}>
                    <div
                      className={cn(
                        "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                        m.mine ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-800"
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      {m.mine ? "" : `${m.authorName} · `}
                      {fmtDisplayDateTime(m.createdAt)}
                    </span>
                  </div>
                ))}
              </div>

              {thread.data.canReply ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (replyText.trim()) reply.mutate({ conversationId: selectedId, body: replyText.trim() });
                  }}
                  className="flex items-end gap-2 p-3 border-t border-slate-100"
                >
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    placeholder={t("replyPlaceholder")}
                    className="flex-1 resize-none px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={reply.isPending || !replyText.trim()}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {reply.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {t("send")}
                  </button>
                </form>
              ) : (
                <p className="p-3 border-t border-slate-100 text-xs text-slate-400 text-center">{t("oversightNote")}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Composer({
  recipients,
  loading,
  onSent,
  onCancel,
}: {
  recipients: { studentId: string; studentName: string; staff: { id: string; name: string }[] }[];
  loading: boolean;
  onSent: (id: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("messages");
  const [studentId, setStudentId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Default to the only child when there's one.
  useEffect(() => {
    if (!studentId && recipients.length === 1) setStudentId(recipients[0]!.studentId);
  }, [recipients, studentId]);

  const start = trpc.messages.start.useMutation({ onSuccess: (r) => onSent(r.conversationId) });
  const staffOptions = useMemo(
    () => recipients.find((r) => r.studentId === studentId)?.staff ?? [],
    [recipients, studentId]
  );

  if (loading) return <Loading />;
  if (recipients.length === 0)
    return <div className="flex-1 flex items-center justify-center text-sm text-slate-400">{t("noRecipients")}</div>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (studentId && staffId && body.trim())
          start.mutate({ studentId, staffId, subject: subject.trim() || undefined, body: body.trim() });
      }}
      className="flex-1 flex flex-col p-4 gap-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">{t("newMessage")}</p>
        <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">
          {t("cancel")}
        </button>
      </div>

      {recipients.length > 1 && (
        <select
          value={studentId}
          onChange={(e) => {
            setStudentId(e.target.value);
            setStaffId("");
          }}
          required
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="" disabled>
            {t("selectChild")}
          </option>
          {recipients.map((r) => (
            <option key={r.studentId} value={r.studentId}>
              {r.studentName}
            </option>
          ))}
        </select>
      )}

      <select
        value={staffId}
        onChange={(e) => setStaffId(e.target.value)}
        required
        disabled={!studentId}
        className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
      >
        <option value="" disabled>
          {t("selectStaff")}
        </option>
        {staffOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder={t("subjectPlaceholder")}
        className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        required
        placeholder={t("messagePlaceholder")}
        className="flex-1 resize-none px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />

      <button
        type="submit"
        disabled={start.isPending || !studentId || !staffId || !body.trim()}
        className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {start.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {t("send")}
      </button>
    </form>
  );
}

function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center py-12 text-slate-300">
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="px-4 py-10 text-center text-sm text-slate-400">{label}</p>;
}
