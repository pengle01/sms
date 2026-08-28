"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Trash2, Undo2 } from "lucide-react";

/**
 * Removes a referral the current user filed. Two shapes of the same action:
 * a draft is simply deleted, while a filed-but-unopened one is *withdrawn* —
 * other people could already see it, so the wording and confirmation are
 * heavier and the server records it in the audit log.
 */
export function DeleteReferralButton({
  referralId,
  number,
  isDraft,
}: {
  referralId: string;
  number: number;
  isDraft: boolean;
}) {
  const t = useTranslations("referrals");
  const router = useRouter();
  const { mutate, isPending } = trpc.referrals.delete.useMutation({
    onSuccess: () => {
      toast.success(isDraft ? t("draftDeleted") : t("withdrawn"));
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleClick = () => {
    const question = isDraft ? t("confirmDeleteDraft") : t("confirmWithdraw", { number });
    if (!confirm(question)) return;
    mutate({ referralId });
  };

  const Icon = isDraft ? Trash2 : Undo2;

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium disabled:opacity-50"
    >
      <Icon className="w-3.5 h-3.5" />
      {isDraft ? t("deleteDraft") : t("withdraw")}
    </button>
  );
}
