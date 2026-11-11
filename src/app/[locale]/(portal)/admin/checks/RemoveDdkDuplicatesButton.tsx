"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Eraser } from "lucide-react";
import { toast } from "sonner";
import { removeDuplicateDdkAwards } from "./actions";

export function RemoveDdkDuplicatesButton({ count }: { count: number }) {
  const t = useTranslations("checks");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm(t("ddkDuplicatesConfirm", { count }))) return;
    startTransition(async () => {
      const res = await removeDuplicateDdkAwards();
      if (res.ok) {
        toast.success(t("ddkDuplicatesRemoved", { count: res.removed }));
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
      {t("ddkDuplicatesRemove", { count })}
    </button>
  );
}
