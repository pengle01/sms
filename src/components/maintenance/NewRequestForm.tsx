"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { EQUIPMENT, DESCRIPTION_MAX, type Equipment } from "@/lib/maintenance";
import { EquipmentIcon } from "./ui";
import { createMaintenanceRequest } from "./maintenance-actions";

export function NewRequestForm({
  rooms,
  basePath,
  defaultRoom,
}: {
  rooms: string[];
  basePath: string;
  defaultRoom?: string;
}) {
  const t = useTranslations("maintenance");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [room, setRoom] = useState(defaultRoom && rooms.includes(defaultRoom) ? defaultRoom : "");
  const [equipment, setEquipment] = useState<Equipment | "">("");
  const [description, setDescription] = useState("");

  const ready = room !== "" && equipment !== "" && description.trim() !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    startTransition(async () => {
      const res = await createMaintenanceRequest({ room, equipment, description });
      if (res.ok) {
        toast.success(t("created"));
        router.push(`${basePath}/${res.id}`);
      } else {
        toast.error(t(res.error));
      }
    });
  }

  const label = "block text-sm font-medium text-slate-700 mb-1.5";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="mr-room" className={label}>{t("fieldRoom")}</label>
        <select
          id="mr-room"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="h-10 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">{t("chooseRoom")}</option>
          {rooms.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className={label}>{t("fieldEquipment")}</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {EQUIPMENT.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={equipment === e}
              onClick={() => setEquipment(e)}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium text-center transition-colors",
                equipment === e
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-400",
              )}
            >
              <EquipmentIcon equipment={e} className="w-5 h-5" />
              {t(`equipment.${e}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="mr-desc" className={label}>{t("fieldDescription")}</label>
        <textarea
          id="mr-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={DESCRIPTION_MAX}
          rows={5}
          placeholder={t("descriptionPlaceholder")}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <p className="text-xs text-slate-400 mt-1 text-right tabular-nums">
          {description.length}/{DESCRIPTION_MAX}
        </p>
      </div>

      <button
        type="submit"
        disabled={!ready || pending}
        className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {t("submit")}
      </button>
    </form>
  );
}
