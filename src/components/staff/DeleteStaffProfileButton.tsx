"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { deleteStaffProfile } from "./staff-link-actions";

/**
 * Remove a timetable person without an account from Χρήστες. The server only
 * allows it when nothing uses the record, and says why when it refuses.
 */
export function DeleteStaffProfileButton({ staffProfileId, name }: { staffProfileId: string; name: string }) {
  const t = useTranslations("adminUsers");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title={t("deleteProfile")}
      onClick={() => {
        if (!confirm(t("deleteProfileConfirm", { name }))) return;
        startTransition(async () => {
          const res = await deleteStaffProfile(staffProfileId);
          if (res.ok) {
            toast.success(t("deleteProfileDone", { name }));
            router.refresh();
          } else {
            const why = res.reasons.map((r) => t(`deleteProfileWhy.${r}` as "deleteProfileWhy.history")).join(" · ");
            toast.error(t("deleteProfileRefused", { reasons: why }));
          }
        });
      }}
      className="text-slate-300 hover:text-red-600 transition-colors disabled:opacity-50"
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </button>
  );
}
