"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Code = { code: string; label: string };
export type SupportRow = {
  kind: "ATOMIC" | "GROUP";
  subject: string;
  teacher: string | null;
  period: number;
  dayOfWeek: number;
};
export type SpecialEdFull = {
  problems: Code[];
  accommodations: Code[];
  remarks: string | null;
  frenchExempt: boolean;
  otherExemptions: string | null;
  support: SupportRow[];
};

const DOW_EL = ["", "Δευ", "Τρί", "Τετ", "Πέμ", "Παρ"];
const DOW_EN = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

function CodeList({ codes }: { codes: Code[] }) {
  if (codes.length === 0) return <span className="text-sm text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map((c) => (
        <Badge key={c.code} variant="outline" className="font-normal" title={c.label}>
          <span className="font-semibold">{c.code}</span>
          <span className="ml-1.5 text-slate-500">{c.label}</span>
        </Badge>
      ))}
    </div>
  );
}

/**
 * Special-education card on the student dossier.
 *  - mode "full"  → counselor / special-ed deputy / headmaster: everything inline.
 *  - mode "codes" → a teacher who teaches the student: codes only, behind an
 *    intentional (audited) reveal button.
 */
export function SpecialEdCard({
  studentId,
  mode,
  data,
  locale,
}: {
  studentId: string;
  mode: "full" | "codes";
  data?: SpecialEdFull;
  locale: string;
}) {
  const t = useTranslations("specialEd");
  const dow = locale === "en" ? DOW_EN : DOW_EL;

  const [revealed, setRevealed] = useState<{ problems: Code[]; accommodations: Code[] } | null>(null);
  const reveal = trpc.specialEd.revealCodes.useMutation({
    onSuccess: (d) => setRevealed(d),
    onError: (e) => toast.error(e.message),
  });

  // ---- Codes-only mode (teacher) ----
  if (mode === "codes") {
    return (
      <Card className="border-amber-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-amber-800">
            <ShieldAlert className="w-4 h-4" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {revealed ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{t("problemCodes")}</p>
                <CodeList codes={revealed.problems} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{t("accommodations")}</p>
                <CodeList codes={revealed.accommodations} />
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500">{t("codesHint")}</p>
              <button
                onClick={() => reveal.mutate({ studentId })}
                disabled={reveal.isPending}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-60"
              >
                {reveal.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                {t("reveal")}
              </button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- Full mode (counselor / deputy / headmaster) ----
  if (!data) return null;
  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-amber-800">
          <ShieldAlert className="w-4 h-4" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{t("problemCodes")}</p>
          <CodeList codes={data.problems} />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{t("accommodations")}</p>
          <CodeList codes={data.accommodations} />
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{t("support")}</p>
          {data.support.length === 0 ? (
            <p className="text-sm text-slate-400">{t("noSupport")}</p>
          ) : (
            <ul className="space-y-1">
              {data.support.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <Badge
                    variant="outline"
                    className={s.kind === "ATOMIC" ? "border-violet-200 text-violet-700" : "border-sky-200 text-sky-700"}
                  >
                    {s.kind === "ATOMIC" ? t("supportAtomic") : t("supportGroup")}
                  </Badge>
                  <span className="font-medium">{s.subject}</span>
                  {s.teacher && <span className="text-slate-400">· {s.teacher}</span>}
                  <span className="text-slate-400 ml-auto">
                    {dow[s.dayOfWeek] ?? ""} {t("periodN", { n: s.period })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(data.remarks || data.frenchExempt || data.otherExemptions) && (
          <div className="space-y-1.5 border-t border-slate-100 pt-3">
            {data.remarks && (
              <p className="text-sm text-slate-700">
                <span className="text-slate-400">{t("remarks")}: </span>
                {data.remarks}
              </p>
            )}
            {data.frenchExempt && <Badge variant="outline">{t("frenchExempt")}</Badge>}
            {data.otherExemptions && (
              <p className="text-sm text-slate-700">
                <span className="text-slate-400">{t("otherExemptions")}: </span>
                {data.otherExemptions}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
