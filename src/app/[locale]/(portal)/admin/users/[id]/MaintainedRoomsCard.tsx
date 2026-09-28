"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { setMaintainedRooms } from "./actions";

interface Props {
  userId: string;
  rooms: { id: string; name: string }[];
  /** Room ids this person maintains now. */
  selected: string[];
  /** Room id → names of the OTHER maintainers of that room. */
  others: Record<string, string[]>;
}

/**
 * Which rooms an IT maintainer looks after. Rooms already covered by someone
 * else are marked with that person's name — a room may have more than one
 * maintainer, but the admin should see it happening.
 */
export function MaintainedRoomsCard({ userId, rooms, selected, others }: Props) {
  const t = useTranslations("adminUsers");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected));

  const dirty = useMemo(
    () => picked.size !== selected.length || selected.some((id) => !picked.has(id)),
    [picked, selected],
  );

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const res = await setMaintainedRooms(userId, [...picked]);
      if (res.ok) {
        toast.success(t("roomsSaved"));
        router.refresh();
      } else {
        toast.error(res.error ?? t("somethingWentWrong"));
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          {t("roomsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-500">{t("roomsHint")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
          {rooms.map((r) => {
            const on = picked.has(r.id);
            const taken = others[r.id];
            return (
              <label
                key={r.id}
                title={taken ? t("roomAlsoMaintainedBy", { names: taken.join(", ") }) : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm cursor-pointer select-none",
                  on ? "border-violet-500 bg-violet-50 text-violet-900" : "border-slate-200 text-slate-600 hover:border-slate-300",
                )}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(r.id)} className="accent-violet-600" />
                <span className="truncate">{r.name}</span>
                {taken && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-slate-400">
            {t("roomsSelected", { count: picked.size })}
            {" · "}
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {t("roomsTakenLegend")}
            </span>
          </p>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t("saveRooms")}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
