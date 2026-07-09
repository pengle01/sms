import { db } from "@/server/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { updateStudent } from "./actions";

const PARENT_ROLES = [
  { role: "FATHER", label: "Πατέρας" },
  { role: "MOTHER", label: "Μητέρα" },
  { role: "GUARDIAN", label: "Κηδεμόνας" },
] as const;

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;

  const [student, groups] = await Promise.all([
    db.studentProfile.findUnique({
      where: { id },
      include: {
        user: true,
        group: true,
        parents: {
          include: { parentProfile: { include: { user: { select: { id: true, name: true, email: true } } } } },
        },
      },
    }),
    db.group.findMany({ orderBy: [{ grade: "asc" }, { name: "asc" }] }),
  ]);

  if (!student) notFound();

  const { user, group } = student;
  const action = updateStudent.bind(null, id, locale);

  const dobValue = student.dateOfBirth ? student.dateOfBirth.toISOString().slice(0, 10) : "";

  // Linked parents by role, for editing the imported parent/guardian fields.
  const parentByRole = new Map(student.parents.map((p) => [p.parentProfile.role, p.parentProfile]));

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href={`/${locale}/admin/students/${id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Πίσω στον μαθητή
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">Επεξεργασία μαθητή</h2>
        <p className="text-slate-500 text-sm mt-1 font-mono">{student.studentId}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form action={action} className="space-y-6">

            {/* Identity */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-100 pb-2">
                Στοιχεία ταυτότητας
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Αρ. Μητρώου (Μητρώο) *" name="studentId" defaultValue={student.studentId} required mono />
                <Field label="Ονοματεπώνυμο *" name="name" defaultValue={user.name ?? ""} required />
                <Field label="Email *" name="email" type="email" defaultValue={user.email} required />
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Φύλο</label>
                  <select name="gender" defaultValue={student.gender ?? ""} className={selectCls}>
                    <option value="">— δεν ορίστηκε —</option>
                    <option value="MALE">Άρρεν</option>
                    <option value="FEMALE">Θήλυ</option>
                  </select>
                </div>
                <Field label="Ημ. γέννησης" name="dateOfBirth" type="date" defaultValue={dobValue} />
                <Field label="Τόπος γέννησης" name="placeOfBirth" defaultValue={student.placeOfBirth ?? ""} />
                <Field label="Υπηκοότητα"     name="nationality"  defaultValue={student.nationality   ?? ""} />
                <Field label="Διεύθυνση"      name="address"      defaultValue={student.address       ?? ""} />
                <Field label="Αρ. ταυτότητας" name="idCardNumber" defaultValue={student.idCardNumber  ?? ""} mono />
                <Field label="Αρ. διαβατηρίου" name="passportNumber" defaultValue={student.passportNumber ?? ""} mono />
              </div>
            </section>

            {/* Enrollment */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-100 pb-2">
                Φοίτηση
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Τμήμα</label>
                  <select name="groupId" defaultValue={group?.id ?? ""} className={selectCls}>
                    <option value="">— χωρίς τμήμα —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({["Α΄", "Β΄", "Γ΄"][g.grade - 1] ?? g.grade} Τάξη)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Κατάσταση</label>
                  <select name="isActive" defaultValue={user.isActive ? "true" : "false"} className={selectCls}>
                    <option value="true">Ενεργός</option>
                    <option value="false">Ανενεργός</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Parents / Guardians (imported) */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-100 pb-2">
                Γονείς / Κηδεμόνες
              </h3>
              {student.parents.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Δεν υπάρχουν συνδεδεμένοι. Προσθέστε παραλήπτες SMS από τη σελίδα του μαθητή· οι γονείς προέρχονται από την εισαγωγή.
                </p>
              ) : (
                <div className="space-y-5">
                  {PARENT_ROLES.map(({ role, label }) => {
                    const p = parentByRole.get(role);
                    if (!p) return null;
                    return (
                      <div key={role} className="space-y-3">
                        <p className="text-xs font-semibold text-slate-500">{label}</p>
                        <input type="hidden" name={`parent_${role}_id`} value={p.id} />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <Field label="Όνομα" name={`parent_${role}_name`} defaultValue={p.user?.name ?? ""} />
                          <Field label="Τηλέφωνο" name={`parent_${role}_phone`} defaultValue={p.phone ?? ""} mono />
                          <Field label="Email" name={`parent_${role}_email`} type="email" defaultValue={p.user?.email ?? ""} />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-slate-400">
                    Η αλλαγή τηλεφώνου εδώ ενημερώνει και την αντίστοιχη επαφή στους παραλήπτες SMS του μαθητή.
                  </p>
                </div>
              )}
            </section>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="h-9 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Αποθήκευση αλλαγών
              </button>
              <Link
                href={`/${locale}/admin/students/${id}`}
                className="h-9 px-5 rounded-lg border border-slate-200 text-sm text-slate-600 font-medium hover:bg-slate-50 transition-colors inline-flex items-center"
              >
                Άκυρο
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

const inputCls =
  "w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white";
const selectCls =
  "w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white";

function Field({
  label, name, defaultValue, type = "text", required, mono,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1.5">{label}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className={`${inputCls} ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
