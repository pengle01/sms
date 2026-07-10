"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { ROOM_NAME_MAX, ROOM_CAPACITY_MAX } from "@/lib/rooms";
import { addRoom, removeRoom } from "./actions";

interface Props {
  rooms: { id: string; name: string; capacity: number }[];
}

export function RoomsForm({ rooms }: Props) {
  const t = useTranslations("adminSettings");
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const input =
    "h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await addRoom(name, parseInt(capacity));
      if (res.ok) {
        setName("");
        setCapacity("");
      } else {
        toast.error(t(res.error as Parameters<typeof t>[0]));
      }
    });
  };

  const remove = (id: string) => {
    setRemovingId(id);
    startTransition(async () => {
      await removeRoom(id);
      setRemovingId(null);
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">{t("roomsHint")}</p>

      <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
        {rooms.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span className="text-sm font-mono text-slate-800">{r.name}</span>
            <span className="flex items-center gap-3">
              <span className="text-xs text-slate-400">{t("roomSeats", { count: r.capacity })}</span>
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={pending}
                title={t("roomRemove")}
                className="text-slate-300 hover:text-red-500 disabled:opacity-40"
              >
                {removingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              </button>
            </span>
          </div>
        ))}
        {rooms.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-slate-400">{t("roomsEmpty")}</p>
        )}
      </div>
      <p className="text-xs text-slate-400">{t("roomsCount", { count: rooms.length })}</p>

      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">{t("roomName")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={ROOM_NAME_MAX}
            required
            className={`${input} w-28`}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">{t("roomCapacity")}</label>
          <input
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            min={1}
            max={ROOM_CAPACITY_MAX}
            required
            className={`${input} w-24`}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t("roomAdd")}
        </button>
      </form>
    </div>
  );
}
