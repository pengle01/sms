"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNow } from "@/lib/dates";
import { StudentPicker, type PickerGroup } from "./StudentPicker";

type ReferralRecommendation =
  | "NO_RECOMMENDATION"
  | "EXPULSION"
  | "STRICT_MEASURE"
  | "OBSERVATION"
  | "STRICT_OBSERVATION"
  | "NOTIFY_PARENTS"
  | "OTHER_RECOMMENDATION";

interface Props {
  groups: PickerGroup[];
  filerName: string;
  locale: string;
}

const REC_LABELS: Record<ReferralRecommendation, string> = {
  NO_RECOMMENDATION: "Καμία εισήγηση",
  EXPULSION: "Παρακαλώ όπως επιβληθεί αποβολή",
  STRICT_MEASURE: "Αυστηρό παιδαγωγικό μέτρο",
  OBSERVATION: "Παρατήρηση (να μην επιβληθεί αποβολή)",
  STRICT_OBSERVATION: "Αυστηρή παρατήρηση (να μην επιβληθεί αποβολή)",
  NOTIFY_PARENTS: "Ενημέρωση γονέων/κηδεμόνων",
  OTHER_RECOMMENDATION: "Άλλη εισήγηση",
};

const today = getNow().toISOString().split("T")[0]!;

export function ReferralForm({ groups, filerName, locale }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [date, setDate] = useState(today);
  const [location, setLocation] = useState("");
  const [incidentTime, setIncidentTime] = useState("");
  const [description, setDescription] = useState("");
  const [extraInfo, setExtraInfo] = useState("");
  const [recommendation, setRecommendation] = useState<ReferralRecommendation>("NO_RECOMMENDATION");

  const { mutate: createReferral, isPending } = trpc.referrals.create.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.isDraft ? "Πρόχειρο αποθηκεύτηκε" : "Καταγγελία υποβλήθηκε");
      router.push(`/${locale}/teacher/referrals`);
    },
    onError: (e) => toast.error(e.message),
  });

  const canSubmit = selectedIds.length > 0 && description.length >= 10;

  const submit = (isDraft: boolean) => {
    if (!canSubmit) return;
    startTransition(() => {
      createReferral({
        studentIds: selectedIds,
        description,
        date,
        location: location || undefined,
        incidentTime: incidentTime || undefined,
        extraInfo: extraInfo || undefined,
        recommendation,
        isDraft,
      });
    });
  };

  return (
    <div className="space-y-6">
      {/* Reporter */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Καταγγέλλων
        </label>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800">
          <User className="w-4 h-4 text-slate-400" />
          {filerName}
        </div>
      </div>

      {/* Student picker */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Στοιχεία Μαθητή(ών)
          {selectedIds.length > 0 && (
            <span className="ml-2 normal-case font-normal text-emerald-600">
              {selectedIds.length} επιλέγηκε
            </span>
          )}
        </label>
        <StudentPicker groups={groups} selectedIds={selectedIds} onChange={setSelectedIds} />
      </div>

      {/* Date / Location / Time */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Ημερ. Παραπτώματος
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Τοποθεσία
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="π.χ. Αίθουσα 5"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Ώρα
          </label>
          <input
            type="time"
            value={incidentTime}
            onChange={(e) => setIncidentTime(e.target.value)}
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Details */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Λεπτομέρειες
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Περιγράψτε το περιστατικό… (τουλάχιστον 10 χαρακτήρες)"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
        />
        {description.length > 0 && description.length < 10 && (
          <p className="text-xs text-red-500">Απαιτούνται τουλάχιστον 10 χαρακτήρες</p>
        )}
      </div>

      {/* Additional info (private) */}
      <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-4">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Επιπρόσθετες Πληροφορίες
        </label>
        <p className="text-xs text-slate-400 italic">
          Οι επιπρόσθετες πληροφορίες δεν αποτελούν μέρος της επίσημης καταγγελίας και δεν μπορούν να χρησιμοποιηθούν από τη διεύθυνση για την επιβολή παιδαγωγικού μέτρου.
        </p>
        <textarea
          value={extraInfo}
          onChange={(e) => setExtraInfo(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none bg-white"
        />
      </div>

      {/* Recommendations */}
      <div className="space-y-2 rounded-xl border border-slate-200 p-4">
        <div>
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Εισηγήσεις προς τη διεύθυνση που αφορούν την ποινή
          </label>
          <p className="text-xs text-slate-400 italic mt-0.5">
            Η διεύθυνση δεν δεσμεύεται να ακολουθήσει τις εισηγήσεις σας. Το παιδαγωγικό μέτρο που θα επιβληθεί είναι στην κρίση της διεύθυνσης.
          </p>
        </div>
        <div className="space-y-2 mt-2">
          {(Object.keys(REC_LABELS) as ReferralRecommendation[]).map((val) => (
            <label key={val} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="recommendation"
                value={val}
                checked={recommendation === val}
                onChange={() => setRecommendation(val)}
                className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-700">{REC_LABELS[val]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Επιστροφή
        </button>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isPending || !canSubmit}
            onClick={() => submit(true)}
            className="h-9 px-4"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Προσωρινή Αποθήκευση
          </Button>
          <Button
            type="button"
            disabled={isPending || !canSubmit}
            onClick={() => submit(false)}
            className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Υποβολή
          </Button>
        </div>
      </div>
    </div>
  );
}
