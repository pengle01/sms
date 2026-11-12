import { getTranslations } from "next-intl/server";
import { Power } from "lucide-react";

/** On the register of the day's last lesson in a room: switch everything off. */
export async function LastInRoomBanner({ room }: { room: string }) {
  const t = await getTranslations("lastInRoom");
  return (
    <div className="flex items-start gap-3 rounded-xl border-2 border-orange-300 bg-orange-50 px-4 py-3 text-orange-900">
      <Power className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold">{t("message")}</p>
        <p className="text-xs text-orange-800 mt-0.5">{t("room", { room })}</p>
      </div>
    </div>
  );
}
