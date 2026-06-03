"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Loader2, RefreshCw, Check, Copy } from "lucide-react";
import { toast } from "sonner";

type Labels = {
  title: string;
  description: string;
  none: string;
  generate: string;
  regenerate: string;
  regenerateWarning: string;
  studentClaimed: string;
  studentNotClaimed: string;
  guardianClaims: string; // "{n} guardian account(s)"
  copied: string;
  copy: string;
};

export function AccessCodeCard({
  studentProfileId,
  labels,
}: {
  studentProfileId: string;
  labels: Labels;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.accessCodes.get.useQuery({ studentProfileId });
  const generate = trpc.accessCodes.generate.useMutation({
    onSuccess: () => utils.accessCodes.get.invalidate({ studentProfileId }),
    onError: (e) => toast.error(e.message),
  });
  const [copied, setCopied] = useState(false);

  const code = data?.code ?? null;

  function handleGenerate() {
    if (code && !confirm(labels.regenerateWarning)) return;
    generate.mutate({ studentProfileId });
  }

  function handleCopy() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast.success(labels.copied);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          {labels.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500">{labels.description}</p>

        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        ) : code ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-lg tracking-[0.3em] text-slate-900 text-center">
                {code}
              </code>
              <button
                onClick={handleCopy}
                className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                title={labels.copy}
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>{data?.studentClaimedAt ? labels.studentClaimed : labels.studentNotClaimed}</span>
              <span>{labels.guardianClaims.replace("{n}", String(data?.guardianClaims ?? 0))}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">{labels.none}</p>
        )}

        <button
          onClick={handleGenerate}
          disabled={generate.isPending}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
        >
          {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {code ? labels.regenerate : labels.generate}
        </button>
      </CardContent>
    </Card>
  );
}
