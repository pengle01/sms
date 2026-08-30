import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTranslations } from "next-intl/server";

/**
 * The record as a reader sees it.
 *
 * Rendered instead of the edit form for someone with view-only access — the
 * counselor. Not a disabled form: there is nothing here to submit, so there is
 * no control to re-enable and no action to aim at.
 */
export async function RecordSummary({
  record,
  problemCatalog,
  accommodationCatalog,
}: {
  record: {
    fileNo: string | null;
    remarks: string | null;
    frenchExempt: boolean;
    otherExemptions: string | null;
    problems: { code: string }[];
    accommodations: { code: string }[];
  } | null;
  /** The record stores codes; the labels come from the catalogs the page loads. */
  problemCatalog: { code: string; label: string }[];
  accommodationCatalog: { code: string; label: string }[];
}) {
  const t = await getTranslations("specialEd");

  if (!record) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-slate-400">{t("noRecord")}</CardContent>
      </Card>
    );
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-start gap-3 py-2">
      <span className="w-44 flex-shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide pt-0.5">
        {label}
      </span>
      <div className="flex-1 min-w-0 text-sm text-slate-700">{value}</div>
    </div>
  );

  const label = (catalog: { code: string; label: string }[], code: string) =>
    catalog.find((c) => c.code === code)?.label ?? "";

  const codes = (list: { code: string }[], catalog: { code: string; label: string }[]) =>
    list.length === 0 ? (
      <span className="text-slate-300">—</span>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        {list.map((c) => (
          <Badge key={c.code} variant="outline" className="text-xs" title={label(catalog, c.code)}>
            <span className="font-semibold">{c.code}</span>
            <span className="ml-1.5 font-normal text-slate-500">{label(catalog, c.code)}</span>
          </Badge>
        ))}
      </div>
    );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-slate-50">
        {row(t("fileNo"), record.fileNo || <span className="text-slate-300">—</span>)}
        {row(t("problemCodes"), codes(record.problems, problemCatalog))}
        {row(t("accommodations"), codes(record.accommodations, accommodationCatalog))}
        {row(
          t("frenchExempt"),
          record.frenchExempt ? <Badge variant="outline" className="text-xs">✓</Badge> : <span className="text-slate-300">—</span>,
        )}
        {row(t("otherExemptions"), record.otherExemptions || <span className="text-slate-300">—</span>)}
        {row(
          t("remarks"),
          record.remarks ? (
            <p className="whitespace-pre-wrap">{record.remarks}</p>
          ) : (
            <span className="text-slate-300">—</span>
          ),
        )}
      </CardContent>
    </Card>
  );
}
