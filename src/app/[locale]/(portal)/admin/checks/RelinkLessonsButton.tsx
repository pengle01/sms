"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { relinkLessons } from "./actions";

export function RelinkLessonsButton() {
  const t = useTranslations("checks");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const res = await relinkLessons();
      if (res.ok) {
        toast.success(t("misattachedFixed", { released: res.released, linked: res.linked }));
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
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
      {t("misattachedFix")}
    </button>
  );
}
