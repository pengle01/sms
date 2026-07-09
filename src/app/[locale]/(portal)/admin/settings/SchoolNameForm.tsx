"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { EditControls } from "./EditControls";

interface Props {
  initial: string;
}

export function SchoolNameForm({ initial }: Props) {
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const { mutate, isPending } = trpc.settings.upsert.useMutation({
    onSuccess: () => {
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) => toast.error(e.message),
  });

  const save = () => mutate({ key: "school_name", value: value.trim() });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Όνομα σχολείου</label>
        <input
          type="text"
          value={value}
          disabled={!editing}
          maxLength={80}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          placeholder="π.χ. Λύκειο Αγίου Γεωργίου"
          className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
        />
        <p className="text-xs text-slate-400">
          Εμφανίζεται πάνω αριστερά σε κάθε σελίδα. Αφήστε το κενό για να
          εμφανίζεται το προεπιλεγμένο όνομα της εφαρμογής.
        </p>
      </div>

      <EditControls
        editing={editing}
        pending={isPending}
        saved={saved}
        onEdit={() => setEditing(true)}
        onCancel={() => { setValue(initial); setEditing(false); }}
        onSave={save}
      />
    </div>
  );
}
