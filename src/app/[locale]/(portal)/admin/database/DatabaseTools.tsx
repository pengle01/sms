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
    try {
      const fd = new FormData();
      fd.set("confirm", restorePhrase);
      fd.set("file", file);
      const res = await fetch(`/${locale}/admin/database/import`, { method: "POST", body: fd });
      const j = (await res.json()) as { ok: boolean; message?: string; error?: string };
      if (j.ok) {
        toast.success(j.message ?? "Η επαναφορά ολοκληρώθηκε.");
        setRestorePhrase("");
        setFile(null);
        router.refresh();
      } else {
        toast.error(j.error ?? "Η εισαγωγή απέτυχε.");
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
            Εφαρμογή ενός αντιγράφου <code>.sql</code> (από την Εξαγωγή). Αυτό <strong>αντικαθιστά ολόκληρη τη βάση δεδομένων</strong>.
            Ενδέχεται να αποσυνδεθείτε αν το αντίγραφο περιέχει διαφορετικό διαχειριστή.
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
