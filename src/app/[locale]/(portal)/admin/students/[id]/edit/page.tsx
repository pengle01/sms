import { db } from "@/server/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { updateStudent } from "./actions";

const PARENT_ROLES = [
  { role: "FATHER", label: "Father" },
  { role: "MOTHER", label: "Mother" },
  { role: "GUARDIAN", label: "Guardian" },
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
          Back to student
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">Edit student</h2>
        <p className="text-slate-500 text-sm mt-1 font-mono">{student.studentId}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form action={action} className="space-y-6">

            {/* Identity */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-100 pb-2">
                Identity
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Registry No (Μητρώο) *" name="studentId" defaultValue={student.studentId} required mono />
                <Field label="Full name *" name="name" defaultValue={user.name ?? ""} required />
                <Field label="Email *" name="email" type="email" defaultValue={user.email} required />
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Gender</label>
                  <select name="gender" defaultValue={student.gender ?? ""} className={selectCls}>
                    <option value="">— not set —</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </div>
                <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={dobValue} />
                <Field label="Place of birth" name="placeOfBirth" defaultValue={student.placeOfBirth ?? ""} />
                <Field label="Nationality"    name="nationality"  defaultValue={student.nationality   ?? ""} />
                <Field label="Address"        name="address"      defaultValue={student.address       ?? ""} />
                <Field label="ID card number" name="idCardNumber" defaultValue={student.idCardNumber  ?? ""} mono />
                <Field label="Passport number" name="passportNumber" defaultValue={student.passportNumber ?? ""} mono />
              </div>
            </section>

            {/* Enrollment */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-100 pb-2">
                Enrollment
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Group</label>
                  <select name="groupId" defaultValue={group?.id ?? ""} className={selectCls}>
                    <option value="">— no group —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} (Year {g.grade})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Status</label>
                  <select name="isActive" defaultValue={user.isActive ? "true" : "false"} className={selectCls}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Parents / Guardians (imported) */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide border-b border-slate-100 pb-2">
                Parents / Guardians
              </h3>
              {student.parents.length === 0 ? (
                <p className="text-sm text-slate-400">
                  None linked. Add SMS recipients from the student page; parents come from the import.
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
                          <Field label="Name" name={`parent_${role}_name`} defaultValue={p.user?.name ?? ""} />
                          <Field label="Phone" name={`parent_${role}_phone`} defaultValue={p.phone ?? ""} mono />
                          <Field label="Email" name={`parent_${role}_email`} type="email" defaultValue={p.user?.email ?? ""} />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-slate-400">
                    Changing a phone here also updates that contact in the student&apos;s SMS recipients.
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
                Save changes
              </button>
              <Link
                href={`/${locale}/admin/students/${id}`}
                className="h-9 px-5 rounded-lg border border-slate-200 text-sm text-slate-600 font-medium hover:bg-slate-50 transition-colors inline-flex items-center"
              >
                Cancel
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
