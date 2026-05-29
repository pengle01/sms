"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Loader2, X, Search, User, Users, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNow } from "@/lib/dates";
import { cn } from "@/lib/utils";

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
}

interface Group {
  id: string;
  name: string;
  students: Student[];
}

interface Props {
  groups: Group[];
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

  // Student selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>(groups[0]?.id ?? "");
  const [search, setSearch] = useState("");

  // Form fields
  const [date, setDate] = useState(today);
  const [location, setLocation] = useState("");
  const [incidentTime, setIncidentTime] = useState("");
  const [description, setDescription] = useState("");
  const [extraInfo, setExtraInfo] = useState("");
  const [recommendation, setRecommendation] = useState<ReferralRecommendation>("NO_RECOMMENDATION");

  // All students flat list for lookup
  const allStudents = useMemo(() => groups.flatMap((g) => g.students.map((s) => ({ ...s, groupName: g.name }))), [groups]);

  const selectedStudents = useMemo(() => allStudents.filter((s) => selectedIds.includes(s.id)), [allStudents, selectedIds]);

  // Current group's students filtered by search
  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const visibleStudents = useMemo(() => {
    if (!activeGroup) return [];
    const q = search.toLowerCase();
    if (!q) return activeGroup.students;
    return activeGroup.students.filter((s) => s.name.toLowerCase().includes(q));
  }, [activeGroup, search]);

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleAll = () => {
    if (!activeGroup) return;
    const groupIds = activeGroup.students.map((s) => s.id);
    const allSelected = groupIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !groupIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...groupIds])]);
    }
  };

  const activeGroupAllSelected = activeGroup?.students.every((s) => selectedIds.includes(s.id)) ?? false;
  const activeGroupSomeSelected = (activeGroup?.students.some((s) => selectedIds.includes(s.id)) && !activeGroupAllSelected) ?? false;

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
    <div className="space-y-5">
      {/* Reporter */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Καταγγέλλων
        </label>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800">
          <User className="w-4 h-4 text-slate-400" />
          {filerName}
        </div>
      </div>

      {/* Student picker */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Στοιχεία Μαθητή(ών)
          </label>
          {selectedIds.length > 0 && (
            <span className="text-xs text-emerald-600 font-medium">
              {selectedIds.length} επιλέγηκε{selectedIds.length !== 1 ? "" : ""}
            </span>
          )}
        </div>

        {/* Selected chips */}
        {selectedStudents.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedStudents.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full px-2.5 py-1 font-medium"
              >
                {s.name}
                <span className="text-emerald-500 text-[10px]">({s.groupName})</span>
                <button type="button" onClick={() => toggle(s.id)} className="hover:text-emerald-600 ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Picker panel */}
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          {/* Group tabs */}
          <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 scrollbar-none">
            {groups.map((g) => {
              const groupSelectedCount = g.students.filter((s) => selectedIds.includes(s.id)).length;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { setActiveGroupId(g.id); setSearch(""); }}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                    activeGroupId === g.id
                      ? "border-emerald-500 text-emerald-700 bg-white"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-white"
                  )}
                >
                  {g.name}
                  {groupSelectedCount > 0 && (
                    <span className="text-[10px] bg-emerald-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">
                      {groupSelectedCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search within group */}
          <div className="p-2 border-b border-slate-100 bg-white">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Αναζήτηση στο ${activeGroup?.name ?? ""}…`}
                className="w-full h-8 pl-8 pr-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
              />
            </div>
          </div>

          {/* Select all row */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50/50">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={activeGroupAllSelected}
                ref={(el) => { if (el) el.indeterminate = activeGroupSomeSelected; }}
                onChange={toggleAll}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
              />
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Επιλογή όλων ({visibleStudents.length})
              </span>
            </label>
          </div>

          {/* Student list */}
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-50 bg-white">
            {visibleStudents.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-400 text-center">Δεν βρέθηκαν μαθητές</p>
            ) : (
              visibleStudents.map((s) => (
                <label
                  key={s.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                    selectedIds.includes(s.id) ? "bg-emerald-50" : "hover:bg-slate-50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggle(s.id)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span className={cn("text-sm", selectedIds.includes(s.id) ? "font-medium text-emerald-900" : "text-slate-700")}>
                    {s.name}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {selectedIds.length === 0 && (
          <p className="text-xs text-slate-400">Επιλέξτε τουλάχιστον έναν μαθητή</p>
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
