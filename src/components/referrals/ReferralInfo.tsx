import { ChevronDown } from "lucide-react";
import { recommendationLabel } from "@/lib/referralLabels";

// Full referral details, expandable in place. Everyone who can see the
// referral sees everything: description, location, incident time, the filer's
// extra information and their recommendation.
export function ReferralInfo({
  referral,
}: {
  referral: {
    description: string;
    location: string | null;
    incidentTime: string | null;
    extraInfo: string | null;
    recommendation: string;
  };
}) {
  const r = referral;
  const hasMore = !!(r.location || r.incidentTime || r.extraInfo || (r.recommendation && r.recommendation !== "NO_RECOMMENDATION"));

  return (
    <details className="group">
      <summary className="list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden">
        <p className="line-clamp-2 group-open:line-clamp-none whitespace-pre-wrap">{r.description}</p>
        <span className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-slate-400 hover:text-slate-600">
          <span className="group-open:hidden">Περισσότερα</span>
          <span className="hidden group-open:inline">Λιγότερα</span>
          <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      {hasMore && (
        <dl className="mt-1.5 space-y-1 text-xs text-slate-500 border-l-2 border-slate-100 pl-2.5">
          {r.location && (
            <div><dt className="inline font-semibold text-slate-600">Τοποθεσία: </dt><dd className="inline">{r.location}</dd></div>
          )}
          {r.incidentTime && (
            <div><dt className="inline font-semibold text-slate-600">Ώρα συμβάντος: </dt><dd className="inline">{r.incidentTime}</dd></div>
          )}
          {r.extraInfo && (
            <div><dt className="inline font-semibold text-slate-600">Επιπλέον πληροφορίες: </dt><dd className="inline whitespace-pre-wrap">{r.extraInfo}</dd></div>
          )}
          {r.recommendation && r.recommendation !== "NO_RECOMMENDATION" && (
            <div><dt className="inline font-semibold text-slate-600">Εισήγηση: </dt><dd className="inline">{recommendationLabel(r.recommendation)}</dd></div>
          )}
        </dl>
      )}
    </details>
  );
}
