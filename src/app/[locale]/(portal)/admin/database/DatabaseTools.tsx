"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { truncateDatabase } from "./actions";

export function DatabaseTools({ locale }: { locale: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const [wipePhrase, setWipePhrase] = useState("");
  const [restorePhrase, setRestorePhrase] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // The last restore's outcome, kept on screen: what did not fit as it was, or why it failed.
  const [restoreNotes, setRestoreNotes] = useState<string[] | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const doWipe = () =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("confirm", wipePhrase);
      const r = await truncateDatabase(fd);
      if (r.ok) {
        toast.success(r.message);
        setWipePhrase("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });

  async function doRestore() {
    if (!file) return toast.error("Επιλέξτε πρώτα ένα αρχείο .sql.");
    setBusy(true);
    setRestoreNotes(null);
    setRestoreError(null);
    try {
      const fd = new FormData();
      fd.set("confirm", restorePhrase);
      fd.set("file", file);
      const res = await fetch(`/${locale}/admin/database/import`, { method: "POST", body: fd });
      const j = (await res.json()) as { ok: boolean; message?: string; error?: string; notes?: string[] };
      if (j.ok) {
        toast.success(j.message ?? "Η επαναφορά ολοκληρώθηκε.");
        setRestoreNotes(j.notes ?? []);
        setRestorePhrase("");
        setFile(null);
        router.refresh();
      } else {
        toast.error("Η επαναφορά απέτυχε — η βάση έμεινε όπως ήταν.");
        setRestoreError(j.error ?? "Η εισαγωγή απέτυχε.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Export */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4 text-slate-400" />
            Εξαγωγή
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Λήψη πλήρους αντιγράφου SQL (σχήμα + όλα τα δεδομένα). Φυλάξτε το με ασφάλεια — περιέχει προσωπικά δεδομένα.
          </p>
          <a
            href={`/${locale}/admin/database/export`}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            <Download className="w-4 h-4" />
            Λήψη αντιγράφου (.sql)
          </a>
        </CardContent>
      </Card>

      {/* Import / restore */}
      <Card className="border-amber-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-amber-800">
            <Upload className="w-4 h-4" />
            Εισαγωγή (επαναφορά)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            Εφαρμογή ενός αντιγράφου <code>.sql</code> (από την Εξαγωγή). Αυτό <strong>αντικαθιστά όλα τα δεδομένα</strong>.
            Ενδέχεται να αποσυνδεθείτε αν το αντίγραφο περιέχει διαφορετικό/ή διαχειριστή/τρια.
          </p>
          <p className="text-xs text-slate-500">
            Η δομή της βάσης μένει πάντα αυτή της τρέχουσας έκδοσης: από ένα παλαιότερο αντίγραφο μπαίνουν μόνο τα δεδομένα.
            Πίνακες ή στήλες που δεν υπάρχουν πια παραλείπονται, οι νέες στήλες παίρνουν την προεπιλεγμένη τιμή τους, και
            όλες οι διαφορές εμφανίζονται εδώ μετά την επαναφορά. Αν κάτι δεν χωράει, δεν αλλάζει τίποτα.
          </p>
          <input
            type="file"
            accept=".sql,application/sql,text/plain"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm"
          />
          <label className="block text-xs text-slate-500">
            Πληκτρολογήστε <strong>RESTORE</strong> για επιβεβαίωση
            <input value={restorePhrase} onChange={(e) => setRestorePhrase(e.target.value)} className={`${input} mt-1`} placeholder="RESTORE" />
          </label>
          <button
            onClick={doRestore}
            disabled={busy || restorePhrase !== "RESTORE" || !file}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Επαναφορά βάσης
          </button>
          {restoreNotes && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 space-y-1">
              <p className="font-semibold">Η επαναφορά ολοκληρώθηκε.</p>
              {restoreNotes.length === 0 ? (
                <p>Το αντίγραφο ταιριάζει ακριβώς με την τρέχουσα δομή.</p>
              ) : (
                <>
                  <p>Διαφορές από την τρέχουσα δομή ({restoreNotes.length}):</p>
                  <ul className="list-disc pl-5 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5">
                    {restoreNotes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </>
              )}
            </div>
          )}
          {restoreError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-1">
              <p className="font-semibold">Η επαναφορά απέτυχε — δεν άλλαξε τίποτα στη βάση.</p>
              <pre className="whitespace-pre-wrap break-words font-mono text-xs max-h-64 overflow-y-auto">{restoreError}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Truncate / wipe */}
      <Card className="border-red-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-4 h-4" />
            Διαγραφή όλων των δεδομένων
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            Οριστική διαγραφή <strong>όλων</strong> των δεδομένων (μαθητές, γονείς, απουσίες, βαθμοί, ρυθμίσεις…).
            Ο δικός σας λογαριασμός διαχειριστή διατηρείται ώστε να παραμείνετε συνδεδεμένοι. <strong>Αυτό δεν μπορεί να αναιρεθεί.</strong>
          </p>
          <label className="block text-xs text-slate-500">
            Πληκτρολογήστε <strong>WIPE</strong> για επιβεβαίωση
            <input value={wipePhrase} onChange={(e) => setWipePhrase(e.target.value)} className={`${input} mt-1`} placeholder="WIPE" />
          </label>
          <button
            onClick={doWipe}
            disabled={pending || wipePhrase !== "WIPE"}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Διαγραφή βάσης
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
