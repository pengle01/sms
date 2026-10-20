"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminDeleteTest } from "./actions";

/** Delete with an inline confirm that says how many grades go with the test. */
export function AdminDeleteTestButton({ testId, grades }: { testId: string; grades: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-slate-300 hover:text-red-500 transition-colors"
        title="Διαγραφή"
        aria-label="Διαγραφή"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {grades > 0 && <span className="text-[11px] text-red-600">+ {grades} βαθμοί</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await adminDeleteTest(testId);
            if (res.ok) {
              toast.success("Το διαγώνισμα διαγράφηκε");
              router.refresh();
            } else {
              toast.error("Η διαγραφή απέτυχε");
              setConfirming(false);
            }
          })
        }
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-60"
      >
        {pending && <Loader2 className="w-3 h-3 animate-spin" />}
        Διαγραφή
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-xs text-slate-500 hover:text-slate-700">
        Άκυρο
      </button>
    </span>
  );
}
