"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { deleteEmptyGroup } from "@/app/[locale]/(portal)/admin/groups/[id]/actions";

/**
 * Remove a group nothing uses — an artifact of a wrong import. The server only
 * allows it when the group has no students, enrolments, lessons or history,
 * and says why when it refuses. `afterHref`: where to go once deleted (from
 * the group's own page); the list just refreshes.
 */
export function DeleteGroupButton({ groupId, name, afterHref, withLabel = false }: {
  groupId: string;
  name: string;
  afterHref?: string;
  withLabel?: boolean;
}) {
  const t = useTranslations("groups");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title={t("deleteGroup")}
      onClick={() => {
        if (!confirm(t("deleteGroupConfirm", { name }))) return;
        startTransition(async () => {
          const res = await deleteEmptyGroup(groupId);
          if (res.ok) {
            toast.success(t("deleteGroupDone", { name }));
            if (afterHref) router.push(afterHref);
            else router.refresh();
          } else {
            const why = res.reasons.map((r) => t(`deleteGroupWhy.${r}` as "deleteGroupWhy.history")).join(" · ");
            toast.error(t("deleteGroupRefused", { reasons: why }));
          }
        });
      }}
      className={
        withLabel
          ? "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
          : "text-slate-300 hover:text-red-600 transition-colors disabled:opacity-50"
      }
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      {withLabel && t("deleteGroup")}
    </button>
  );
}
