"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Loader2, X, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNow } from "@/lib/dates";
type ReferralRecommendation =
  | "NO_RECOMMENDATION"
  | "EXPULSION"
  | "STRICT_MEASURE"
  | "OBSERVATION"
  | "STRICT_OBSERVATION"
  | "NOTIFY_PARENTS"
  | "OTHER_RECOMMENDATION";

interface Student {
  id: string;
  name: string;
  studentId: string;
  groupName: string;
}

interface Props {
  students: Student[];
  filerName: string;
  locale: string;
}

const RECOMMENDATIONS: { value: ReferralRecommendation; labelKey: string }[] = [
  { value: "NO_RECOMMENDATION", labelKey: "rec_NO_RECOMMENDATION" },
  { value: "EXPULSION", labelKey: "rec_EXPULSION" },
  { value: "STRICT_MEASURE", labelKey: "rec_STRICT_MEASURE" },
  { value: "OBSERVATION", labelKey: "rec_OBSERVATION" },
  { value: "STRICT_OBSERVATION", labelKey: "rec_STRICT_OBSERVATION" },
  { value: "NOTIFY_PARENTS", labelKey: "rec_NOTIFY_PARENTS" },
  { value: "OTHER_RECOMMENDATION", labelKey: "rec_OTHER_RECOMMENDATION" },
];

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

export function ReferralForm({ students, filerName, locale }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const [date, setDate] = useState(today);
  const [location, setLocation] = useState("");
  const [incidentTime, setIncidentTime] = useState("");
  const [description, setDescription] = useState("");
  const [extraInfo, setExtraInfo] = useState("");
  const [recommendation, setRecommendation] = useState<ReferralRecommendation>("NO_RECOMMENDATION");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        s.groupName.toLowerCase().includes(q)
    );
  }, [students, search]);

  const selectedStudents = students.filter((s) => selectedIds.includes(s.id));

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const { mutate: createReferral, isPending } = trpc.referrals.create.useMutation({
    onSuccess: (_, vars) => {
      if (vars.isDraft) {
        toast.success("Πρόχειρο αποθηκεύτηκε");
      } else {
        toast.success("Καταγγελία υποβλήθηκε");
      }
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
    <div className="space-y-5">
      {/* Reporter */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Καταγγέλλων
        </label>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">
          <User className="w-4 h-4 text-slate-400" />
          {filerName}
        </div>
      </div>

      {/* Student picker */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Στοιχεία Μαθητή(ών)
        </label>

        {/* Selected chips */}
        {selectedStudents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1">
            {selectedStudents.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full px-2.5 py-1"
              >
                {s.name}
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  className="hover:text-emerald-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-500 hover:border-emerald-400 hover:text-slate-700 text-left transition-colors bg-white"
        >
          <Search className="w-4 h-4" />
          {selectedIds.length === 0
            ? "Πατήστε εδώ για να επιλέξετε μαθητές"
            : `${selectedIds.length} μαθητ${selectedIds.length === 1 ? "ής" : "ές"} επιλέγηκε`}
        </button>

        {showPicker && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 w-4 h-4 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Αναζήτηση μαθητή…"
                  className="w-full h-8 pl-8 pr-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-400">Δεν βρέθηκαν μαθητές</p>
              ) : (
                filtered.slice(0, 50).map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggle(s.id)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-slate-800">{s.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{s.groupName}</span>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="p-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100"
              >
                Κλείσιμο
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Date / Location / Time row */}
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
          {RECOMMENDATIONS.map((rec) => (
            <label key={rec.value} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="recommendation"
                value={rec.value}
                checked={recommendation === rec.value}
                onChange={() => setRecommendation(rec.value)}
                className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-700">{REC_LABELS[rec.value]}</span>
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
