"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Code = { code: string; label: string };

/**
 * A student's problem codes on the teacher's special-ed tab: they reach the
 * browser only after this click, and revealCodes writes the audit row.
 */
export function RevealProblemCodes({ studentId }: { studentId: string }) {
  const t = useTranslations("specialEd");
  const [problems, setProblems] = useState<Code[] | null>(null);
  const reveal = trpc.specialEd.revealCodes.useMutation({
    onSuccess: (d) => setProblems(d.problems),
    onError: (e) => toast.error(e.message),
  });

  if (problems === null) {
    return (
      <button
        type="button"
        onClick={() => reveal.mutate({ studentId })}
        disabled={reveal.isPending}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-amber-200 bg-amber-50 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
      >
        {reveal.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
        {t("reveal")}
      </button>
    );
  }
  if (problems.length === 0) return <span className="text-sm text-slate-300">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {problems.map((c) => (
        <Badge key={c.code} variant="outline" className="font-normal" title={c.label}>
          <span className="font-semibold">{c.code}</span>
          <span className="ml-1.5 text-slate-500">{c.label}</span>
        </Badge>
      ))}
    </div>
  );
}
