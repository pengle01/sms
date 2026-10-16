import { redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { getSchoolName } from "@/lib/schoolConfig";
import { isHomegroupWhere } from "@/lib/homegroupFilter";
import { formatAccessCode } from "@/lib/accessCode";
import { publicOrigin } from "@/lib/redirect";
import { slipPages, activationUrl, type Slip, type SlipGroup } from "@/lib/codeSlips";
import { PrintBar } from "@/app/[locale]/(portal)/teacher/substitutions/plan/[date]/print/PrintBar";

/**
 * Access-code slips for one homegroup or all of them: two students per A4,
 * cut in half by the school. Each slip: name, homegroup, code, a QR to the
 * activation page and short instructions. SUPER_ADMIN only.
 */
export default async function CodeSlipsPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string }>;
}) {
  const { locale } = await params;
  const { groupId } = await searchParams;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  if (!groupId) redirect(`/${locale}/admin/students`);

  const t = await getTranslations("codeSlips");
  const [schoolName, groups] = await Promise.all([
    getSchoolName(),
    db.group.findMany({
      where: groupId === "all" ? isHomegroupWhere() : { id: groupId },
      select: {
        name: true,
        students: {
          where: { user: { isActive: true } },
          select: { user: { select: { name: true } }, accessCode: { select: { code: true } } },
        },
      },
    }),
  ]);

  const byName = (a: string, b: string) => a.localeCompare(b, "el", { numeric: true });
  const missing: string[] = [];
  const slipGroups: SlipGroup[] = groups
    .sort((a, b) => byName(a.name, b.name))
    .map((g) => ({
      groupName: g.name,
      slips: g.students
        .filter((s) => {
          if (!s.accessCode) missing.push(`${s.user?.name ?? "—"} (${g.name})`);
          return !!s.accessCode;
        })
        .map((s) => ({ studentName: s.user?.name ?? "—", groupName: g.name, code: s.accessCode!.code }))
        .sort((a, b) => byName(a.studentName, b.studentName)),
    }));
  const pages = slipPages(slipGroups);

  const origin = publicOrigin(await headers(), "http://localhost");
  const siteLabel = origin.replace(/^https?:\/\//, "");
  const qr = new Map<string, string>();
  await Promise.all(
    pages.flat().map(async (s) => {
      if (s && !qr.has(s.code)) {
        qr.set(s.code, await QRCode.toString(activationUrl(origin, s.code), { type: "svg", margin: 0, errorCorrectionLevel: "M" }));
      }
    }),
  );

  const half = (s: Slip | null) =>
    s ? (
      <div className="h-[148.5mm] box-border px-[18mm] py-[14mm] flex flex-col">
        <div className="text-center border-b border-slate-300 pb-2">
          {schoolName && <p className="text-[11pt] font-semibold text-slate-700">{schoolName}</p>}
          <p className="text-[10pt] uppercase tracking-widest text-slate-500">{t("title")}</p>
        </div>
        <div className="mt-5 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[10pt] text-slate-500">{t("student")}</p>
            <p className="text-[18pt] font-bold text-slate-900 leading-tight">{s.studentName}</p>
            <p className="mt-2 text-[10pt] text-slate-500">{t("homegroup")}</p>
            <p className="text-[15pt] font-semibold text-slate-800">{s.groupName}</p>
            <p className="mt-4 text-[10pt] text-slate-500">{t("code")}</p>
            <p className="font-mono text-[26pt] font-bold tracking-wider text-slate-900 whitespace-nowrap">
              {formatAccessCode(s.code)}
            </p>
          </div>
          <div
            className="w-[35mm] h-[35mm] flex-shrink-0 [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: qr.get(s.code) ?? "" }}
          />
        </div>
        <ol className="mt-auto text-[10pt] text-slate-700 space-y-1 list-decimal pl-5">
          <li>{t("step1", { site: `${siteLabel}/el/activate` })}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
        </ol>
      </div>
    ) : (
      <div className="h-[148.5mm]" />
    );

  return (
    <>
      <PrintBar backHref={`/${locale}/admin/students`} />
      <div className="print:hidden px-8 py-3 text-sm text-slate-600 bg-white border-b border-slate-200">
        {t("summary", { slips: pages.flat().filter(Boolean).length, sheets: pages.length })}
        {missing.length > 0 && (
          <p className="mt-1 text-amber-700">
            {t("missing", { count: missing.length })} {missing.join(", ")}
          </p>
        )}
      </div>
      <div className="bg-slate-100 print:bg-white py-6 print:py-0">
        {pages.length === 0 ? (
          <p className="text-center text-slate-400 py-16">{t("empty")}</p>
        ) : (
          pages.map(([top, bottom], i) => (
            <div
              key={i}
              className="slip-sheet mx-auto mb-6 print:mb-0 w-[210mm] h-[297mm] bg-white shadow print:shadow-none overflow-hidden"
            >
              {half(top)}
              <div className="relative h-0 border-t border-dashed border-slate-400">
                <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-[8pt] text-slate-400">✂</span>
              </div>
              {half(bottom)}
            </div>
          ))
        )}
      </div>
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: white !important; }
          /* The portal layout is a fixed-height, scrolling frame — let it grow
             so every sheet prints, not just the first. */
          .h-screen { height: auto !important; }
          .overflow-hidden, .overflow-y-auto { overflow: visible !important; }
          main { padding: 0 !important; }
          .slip-sheet { break-after: page; }
          .slip-sheet:last-child { break-after: auto; }
        }
      `}</style>
    </>
  );
}
