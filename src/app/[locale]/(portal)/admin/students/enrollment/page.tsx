import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnrollmentImportForm } from "./import-form";

export default async function EnrollmentImportPage({
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
          href={`/${locale}/admin/students`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Πίσω στους μαθητές
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">Εισαγωγή κατανομής μαθητών</h2>
        <p className="text-slate-500 text-sm mt-1">
          Αναθέτει κάθε μαθητή στις ομάδες μαθημάτων του. Η επανεισαγωγή
          συγχρονίζει κάθε μαθητή με τη γραμμή του — οι ομάδες του αρχείου
          προστίθενται και όσες δεν αναφέρονται πλέον αφαιρούνται. Αφαιρούνται
          μόνο ομάδες που αναφέρονται στο αρχείο: οι αναθέσεις που έγιναν
          χειροκίνητα σε ομάδες εκτός αρχείου διατηρούνται. (Γραμμή με μη
          αναγνωρισμένο κωδικό ομάδας μόνο προσθέτει, ποτέ δεν αφαιρεί, ώστε ένα
          τυπογραφικό λάθος να μη διαγράψει κατανομές.)
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Μεταφόρτωση αρχείου</CardTitle>
        </CardHeader>
        <CardContent>
          <EnrollmentImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-700">Αναμενόμενη μορφή</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p>Το αρχείο πρέπει να ακολουθεί την τυπική διάταξη εξαγωγής κατανομής του υπουργείου:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-500">
            <li>Γραμμή 1: επικεφαλίδες (παραλείπεται)</li>
            <li>Στήλη A: όνομα μαθητή</li>
            <li>Στήλη B: αριθμός μητρώου (ΑΡ.ΜΗΤ.) — χρησιμοποιείται για την αντιστοίχιση του μαθητή</li>
            <li>Στήλη E: τμήμα (Νέο Τμήμα)</li>
            <li>Στήλες F και εξής: κωδικοί ομάδων μαθημάτων</li>
          </ul>
          <p className="text-slate-400 text-xs pt-1">
            Οι μαθητές που δεν βρίσκονται με βάση τον αριθμό μητρώου αναφέρονται ως προειδοποιήσεις και παραλείπονται.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
