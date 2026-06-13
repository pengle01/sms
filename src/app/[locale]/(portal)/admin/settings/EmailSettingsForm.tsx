"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Eye, EyeOff, Send, Loader2 } from "lucide-react";
import { EditControls } from "./EditControls";

interface Props {
  initial: { host: string; port: string; user: string; pass: string; from: string; fromName: string };
}

export function EmailSettingsForm({ initial }: Props) {
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(initial.port);
  const [user, setUser] = useState(initial.user);
  const [pass, setPass] = useState(initial.pass);
  const [from, setFrom] = useState(initial.from);
  const [fromName, setFromName] = useState(initial.fromName);
  const [showPass, setShowPass] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testTo, setTestTo] = useState("");

  const { mutate, isPending } = trpc.settings.upsertMany.useMutation({
    onSuccess: () => {
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) => toast.error(e.message),
  });

  const test = trpc.settings.sendTestEmail.useMutation({
    onSuccess: (r) => (r.success ? toast.success("Test email sent") : toast.error(r.error ?? "Send failed")),
    onError: (e) => toast.error(e.message),
  });

  const save = () =>
    mutate([
      { key: "email_smtp_host", value: host.trim() },
      { key: "email_smtp_port", value: port.trim() || "587" },
      { key: "email_smtp_user", value: user.trim() },
      { key: "email_smtp_pass", value: pass },
      { key: "email_from", value: from.trim() },
      { key: "email_from_name", value: fromName.trim() },
    ]);

  const sendTest = () =>
    test.mutate({
      host: host.trim(),
      port: Number(port.trim() || "587"),
      user: user.trim(),
      pass,
      from: from.trim(),
      fromName: fromName.trim(),
      to: testTo.trim(),
    });

  const configured = !!initial.host && !!initial.user && !!initial.pass;
  const field = "w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${configured ? "bg-green-500" : "bg-slate-300"}`} />
        <span className="text-xs text-slate-500">{configured ? "Configured" : "Not configured"}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">SMTP Host</label>
          <input value={host} disabled={!editing} onChange={(e) => setHost(e.target.value)} placeholder="smtp.office365.com" className={field} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Port</label>
          <input value={port} disabled={!editing} onChange={(e) => setPort(e.target.value)} placeholder="587" className={field} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Username</label>
        <input value={user} disabled={!editing} onChange={(e) => setUser(e.target.value)} placeholder="resend" className={field} />
        <p className="text-xs text-slate-400">Resend: the literal username <code>resend</code>. (M365 later: the mailbox email.)</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Password / API key</label>
        <div className="relative">
          <input
            type={showPass ? "text" : "password"}
            value={pass}
            disabled={!editing}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Resend API key (re_…)"
            className={`${field} pr-9`}
          />
          <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Resend: paste an API key from resend.com → API Keys. (M365 later: the mailbox password / App Password.)
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">From address</label>
          <input type="email" value={from} disabled={!editing} onChange={(e) => setFrom(e.target.value)} placeholder="noreply@your-verified-domain" className={field} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">From name (shown to recipients)</label>
          <input value={fromName} disabled={!editing} onChange={(e) => setFromName(e.target.value)} placeholder="School name" className={field} />
        </div>
      </div>
      <p className="text-xs text-slate-400 -mt-1">
        Resend delivers to anyone only from a domain you verified in Resend (DNS). To just test, use
        {" "}<code>onboarding@resend.dev</code> as the From address and send to your own Resend signup email.
      </p>

      <EditControls
        editing={editing}
        pending={isPending}
        saved={saved}
        onEdit={() => setEditing(true)}
        onCancel={() => {
          setHost(initial.host); setPort(initial.port); setUser(initial.user);
          setPass(initial.pass); setFrom(initial.from); setFromName(initial.fromName);
          setShowPass(false); setEditing(false);
        }}
        onSave={save}
      />

      {/* Send a test email with the current values */}
      <div className="border-t border-slate-100 pt-4 space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Send test email</label>
        <div className="flex gap-2">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
            className={field}
          />
          <button
            type="button"
            onClick={sendTest}
            disabled={test.isPending || !testTo.trim() || !host.trim() || !user.trim() || !pass}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50 flex-shrink-0"
          >
            {test.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </button>
        </div>
        <p className="text-xs text-slate-400">Uses the values above (save first to make them permanent).</p>
      </div>
    </div>
  );
}
