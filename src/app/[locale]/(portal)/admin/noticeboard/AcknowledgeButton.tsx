"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Check } from "lucide-react";

export function AcknowledgeButton({ noticeId, acknowledged: initial }: { noticeId: string; acknowledged: boolean }) {
  const [acknowledged, setAcknowledged] = useState(initial);

  const { mutate, isPending } = trpc.notices.acknowledge.useMutation({
    onSuccess: () => setAcknowledged(true),
    onError: (e) => toast.error(e.message),
  });

  if (acknowledged) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-green-600 font-medium">
        <Check className="w-3.5 h-3.5" />
        Acknowledged
      </span>
    );
  }

  return (
    <button
      onClick={() => mutate({ noticeId })}
      disabled={isPending}
      className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
    >
      Mark as read
    </button>
  );
}
