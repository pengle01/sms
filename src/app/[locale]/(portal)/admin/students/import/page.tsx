import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ImportForm } from "./import-form";

export default async function ImportStudentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/admin/students`);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/${locale}/admin/students`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Πίσω στους μαθητές
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">Εισαγωγή μαθητών</h2>
        <p className="text-slate-500 text-sm mt-1">
          Μεταφορτώστε το αρχείο Excel του μητρώου μαθητών. Οι υπάρχοντες μαθητές (με αντιστοίχιση μέσω αριθμού μητρώου) ενημερώνονται· οι νέοι δημιουργούνται.
          Οι λογαριασμοί γονέων και οι επαφές SMS δημιουργούνται αυτόματα από το αρχείο.
        </p>
      </div>

      <ImportForm />

      <div className="text-xs text-slate-400 space-y-1 max-w-xl">
        <p className="font-medium text-slate-500">Αναμενόμενες στήλες (ελληνικές επικεφαλίδες, πρώτο φύλλο):</p>
        <p>Τμήμα · Τάξη · Επώνυμο · Όνομα · Μητρώο · Φύλο · Ημ/νία Γέννησης · Αρ. Ταυτότητας · Αρ. Διαβατηρίου · Εθνικότητα · Τόπος Γέννησης</p>
        <p>e-Mail (1) - Μαθητή · Επώνυμο/Όνομα Πατέρα · Κινητό (2) - Πατέρα · e-Mail (2) - Πατέρα</p>
        <p>Επώνυμο/Όνομα Μητέρας · Κινητό (3) - Μητέρας · e-Mail (3) - Μητέρας</p>
        <p>Επώνυμο/Όνομα Κηδεμόνα · Τηλέφωνο (1) · τηλέφωνο SMS</p>
        <p className="pt-1">Οι μαθητές χωρίς email λαμβάνουν προσωρινή διεύθυνση (<code>s.&lt;id&gt;@pending.sms</code>) που μπορεί να ενημερωθεί αργότερα.</p>
      </div>
    </div>
  );
}
