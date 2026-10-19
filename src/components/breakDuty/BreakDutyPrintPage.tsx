import { notFound } from "next/navigation";
import { isRealDate } from "@/lib/substitutionImport";
import { loadBreakDutyDay } from "@/server/breakDuty";
import { BreakDutyReport } from "@/components/breakDuty/BreakDutyReport";
import { PrintBar } from "@/app/[locale]/(portal)/teacher/substitutions/plan/[date]/print/PrintBar";

/** The A4 break-duty report page — shared by the duty desk and the office (each gates access). */
export async function BreakDutyPrintPage({ date, backHref }: { date: string; backHref: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRealDate(date)) notFound();
  const day = await loadBreakDutyDay(date);
  return (
    <>
      <PrintBar backHref={backHref} />
      <div className="bg-white min-h-screen print:min-h-0">
        <div className="max-w-4xl mx-auto px-10 py-8 print:max-w-none print:p-0">
          <BreakDutyReport day={day} />
        </div>
      </div>
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body { background: white !important; }
          .h-screen { height: auto !important; }
          .overflow-hidden, .overflow-y-auto { overflow: visible !important; }
          main { padding: 0 !important; }
        }
      `}</style>
    </>
  );
}
