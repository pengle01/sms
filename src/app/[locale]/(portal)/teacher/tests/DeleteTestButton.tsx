"use client";

import { useTransition } from "react";
import { deleteTest } from "./actions";
import { Trash2, Loader2 } from "lucide-react";

export function DeleteTestButton({ testId }: { testId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this test?")) return;
        startTransition(() => deleteTest(testId));
      }}
      className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40"
      title="Delete"
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </button>
  );
}
