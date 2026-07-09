import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleImportForm } from "./import-form";

export default async function TimetableImportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const auth = await getSuperAdminAuth();
  if (!auth) {
    redirect(`/${locale}/admin`);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href={`/${locale}/admin/timetable`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Πίσω στο πρόγραμμα
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">Εισαγωγή προγράμματος</h2>
        <p className="text-slate-500 text-sm mt-1">
          Μεταφορτώστε το Excel ωρολογίου προγράμματος καθηγητών που εξάγεται από το σύστημα του υπουργείου.
          Οι ώρες ενημερώνονται στη θέση τους — η επανεισαγωγή είναι ασφαλής.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Μεταφόρτωση αρχείου</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-700">Αναμενόμενη μορφή</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p>Το αρχείο πρέπει να ακολουθεί την τυπική διάταξη εξαγωγής προγράμματος του υπουργείου:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-500">
            <li>Γραμμές 1–2: επικεφαλίδες (παραλείπονται)</li>
            <li>Στήλη A: όνομα καθηγητή (ανά δεύτερη γραμμή)</li>
            <li>Στήλες D–AQ (δείκτες 3–42): 5 ημέρες × 8 ώρες</li>
            <li>Κελί γραμμής καθηγητή: κωδικός τμήματος (π.χ. <code className="font-mono bg-slate-100 px-1 rounded">ΜΟ2α</code>)</li>
            <li>Κελί γραμμής λεπτομερειών: <code className="font-mono bg-slate-100 px-1 rounded">Αίθουσα / Όνομα μαθήματος (τάξη)</code></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
