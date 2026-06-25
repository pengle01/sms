"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Code = { code: string; label: string };

/**
 * Special-education indicator for the attendance-marking roster (point of
 * teaching). Shows an amber shield; the teacher taps to reveal the student's
 * codes (problems + accommodations). The reveal is re-authorized and audited
 * server-side (specialEd.revealCodes) — same gate as the dossier card.
 */
export function SpecialEdInline({ studentId }: { studentId: string }) {
  const t = useTranslations("specialEd");
  const [codes, setCodes] = useState<{ problems: Code[]; accommodations: Code[] } | null>(null);
  const reveal = trpc.specialEd.revealCodes.useMutation({
    onSuccess: setCodes,
    onError: (e) => toast.error(e.message),
  });

  if (codes) {
    const all = [...codes.problems, ...codes.accommodations];
    return (
      <span className="mt-0.5 flex flex-wrap items-center gap-1">
        <ShieldAlert className="w-3 h-3 flex-shrink-0 text-amber-600" />
        {all.length === 0 ? (
          <span className="text-xs text-slate-400">—</span>
        ) : (
          all.map((c) => (
            <Badge
              key={c.code}
              variant="outline"
              className="px-1.5 py-0 text-[10px] font-normal border-amber-200 text-amber-800"
              title={c.label}
            >
              <span className="font-semibold">{c.code}</span>
            </Badge>
          ))
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => reveal.mutate({ studentId })}
      disabled={reveal.isPending}
      className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 disabled:opacity-60"
    >
      {reveal.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3" />}
      {t("rosterReveal")}
    </button>
  );
}
