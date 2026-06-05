"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { cancelSubstitutionRequest } from "./actions";

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const t = useTranslations("substitutions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleCancel = () => {
    startTransition(async () => {
      const res = await cancelSubstitutionRequest(requestId);
      if (res.ok) {
        toast.success(t("cancelled"));
        router.refresh();
      } else {
        toast.error(t(res.error as Parameters<typeof t>[0]));
      }
    });
  };

  return (
    <button
      onClick={handleCancel}
      disabled={pending}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-medium text-red-500 hover:bg-red-50 flex-shrink-0 disabled:opacity-60"
    >
      {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
      {t("cancel")}
    </button>
  );
}
