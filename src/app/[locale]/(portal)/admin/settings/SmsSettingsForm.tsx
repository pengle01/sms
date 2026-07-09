"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { EditControls } from "./EditControls";

interface Props {
  initial: { apiUrl: string; apiKey: string; senderId: string };
}

export function SmsSettingsForm({ initial }: Props) {
  const [apiUrl, setApiUrl]     = useState(initial.apiUrl);
  const [apiKey, setApiKey]     = useState(initial.apiKey);
  const [senderId, setSenderId] = useState(initial.senderId);
  const [showKey, setShowKey]   = useState(false);
  const [editing, setEditing]   = useState(false);
  const [saved, setSaved]       = useState(false);

  const { mutate, isPending } = trpc.settings.upsertMany.useMutation({
    onSuccess: () => {
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) => toast.error(e.message),
  });

  const save = () =>
    mutate([
      { key: "sms_api_url",   value: apiUrl.trim() },
      { key: "sms_api_key",   value: apiKey.trim() },
      { key: "sms_sender_id", value: senderId.trim() || "SCHOOL" },
    ]);

  const configured = !!initial.apiUrl && !!initial.apiKey;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${configured ? "bg-green-500" : "bg-slate-300"}`} />
        <span className="text-xs text-slate-500">{configured ? "Ρυθμισμένο" : "Μη ρυθμισμένο"}</span>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">URL τελικού σημείου API</label>
          <input
            type="url"
            value={apiUrl}
            disabled={!editing}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://api.websms.com.cy/api/send"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
          />
          <p className="text-xs text-slate-400">Το λαμβάνετε από το websms.com.cy — SMS via API</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Κλειδί API</label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              disabled={!editing}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Το κλειδί API WebSMS σας"
              className="w-full h-9 px-3 pr-9 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-400">websms.com.cy/en/account/api-key</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Αναγνωριστικό αποστολέα</label>
          <input
            type="text"
            value={senderId}
            disabled={!editing}
            onChange={(e) => setSenderId(e.target.value.slice(0, 11))}
            placeholder="SCHOOL"
            maxLength={11}
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
          />
          <p className="text-xs text-slate-400">Το όνομα που εμφανίζεται στο τηλέφωνο του παραλήπτη (έως 11 χαρακτήρες)</p>
        </div>
      </div>

      <EditControls
        editing={editing}
        pending={isPending}
        saved={saved}
        onEdit={() => setEditing(true)}
        onCancel={() => {
          setApiUrl(initial.apiUrl);
          setApiKey(initial.apiKey);
          setSenderId(initial.senderId);
          setShowKey(false);
          setEditing(false);
        }}
        onSave={save}
      />
    </div>
  );
}
