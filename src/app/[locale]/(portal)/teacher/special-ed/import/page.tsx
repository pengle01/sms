import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { canManageSpecialEdRegister } from "@/lib/specialEd";
import { SpecialEdImportForm } from "./SpecialEdImportForm";

export default async function SpecialEdImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { specialEducation: true },
  });
  // Narrower than viewing: the counselor reads the dossier but does not own
  // the register, and an import rewrites the whole cohort's codes.
  if (!canManageSpecialEdRegister(auth.roles, !!staff?.specialEducation)) {
    redirect(`/${locale}/teacher/special-ed`);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start gap-3">
        <Link href={`/${locale}/teacher/special-ed`} className="text-slate-500 hover:text-slate-700 mt-1">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Εισαγωγή Ειδικής Αγωγής</h2>
          <p className="text-slate-500 text-sm mt-1">
            Αρχείο Excel με στήλη «Αρ. Μητρ.» και «Κωδικός Προβλήματος 1…6». Οι μαθητές
            ταυτοποιούνται με τον Αριθμό Μητρώου. Η στήριξη (ΣΤΗΡ) δεν εισάγεται — προκύπτει
            αυτόματα από το ωρολόγιο πρόγραμμα.
          </p>
        </div>
      </div>

      <SpecialEdImportForm />
    </div>
  );
}
