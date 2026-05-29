"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export function DeleteDraftButton({ referralId }: { referralId: string }) {
  const router = useRouter();
  const { mutate, isPending } = trpc.referrals.delete.useMutation({
    onSuccess: () => {
      toast.success("Πρόχειρο διαγράφηκε");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleClick = () => {
    if (!confirm("Να διαγραφεί το πρόχειρο;")) return;
    mutate({ referralId });
  };

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" />
      Διαγραφή
    </button>
  );
}
