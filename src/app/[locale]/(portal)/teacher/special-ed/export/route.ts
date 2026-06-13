import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { canViewSpecialEdFull } from "@/lib/specialEd";

// Exports the special-ed cohort as an .xlsx the coordinator can keep as next
// year's base. Column layout round-trips with the importer (one column per
// problem code / accommodation, registry number for matching).
export async function GET(_req: NextRequest) {
  const auth = await getActiveAuth();
  if (!auth) return new NextResponse("Forbidden", { status: 403 });
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { specialEducation: true },
  });
  if (!canViewSpecialEdFull(auth.roles, !!staff?.specialEducation)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const records = await db.specialEdRecord.findMany({
    select: {
      fileNo: true,
      remarks: true,
      frenchExempt: true,
      otherExemptions: true,
      student: {
        select: {
          studentId: true,
          user: { select: { name: true } },
          group: { select: { name: true } },
        },
      },
      problems: { select: { code: true }, orderBy: { code: "asc" } },
      accommodations: { select: { code: true } },
    },
  });

  records.sort(
    (a, b) =>
      (a.student.group?.name ?? "").localeCompare(b.student.group?.name ?? "") ||
      (a.student.user?.name ?? "").localeCompare(b.student.user?.name ?? ""),
  );

  const maxProblems = Math.max(1, ...records.map((r) => r.problems.length));
  const maxAccoms = Math.max(1, ...records.map((r) => r.accommodations.length));

  const header = [
    "Αρ. Μητρ.",
    "Ονοματεπώνυμο",
    "Τμήμα",
    "Αρ. Φακέλου",
    ...Array.from({ length: maxProblems }, (_, i) => `Κωδικός Προβλήματος ${i + 1}`),
    ...Array.from({ length: maxAccoms }, (_, i) => `Διευκόλυνση ${i + 1}`),
    "Παρατηρήσεις",
    "Απαλλαγή Γαλλικών",
    "Άλλες Απαλλαγές",
  ];

  const rows = records.map((r) => {
    const accoms = [...r.accommodations].sort((a, b) => Number(a.code) - Number(b.code));
    return [
      r.student.studentId,
      r.student.user?.name ?? "",
      r.student.group?.name ?? "",
      r.fileNo ?? "",
      ...Array.from({ length: maxProblems }, (_, i) => r.problems[i]?.code ?? ""),
      ...Array.from({ length: maxAccoms }, (_, i) => accoms[i]?.code ?? ""),
      r.remarks ?? "",
      r.frenchExempt ? "Ναι" : "",
      r.otherExemptions ?? "",
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ειδική Αγωγή");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
  // Copy into a fresh ArrayBuffer-backed view so the body type matches BodyInit.
  const bytes = new Uint8Array(buf.length);
  bytes.set(buf);
  const body = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="special-ed-${today}.xlsx"`,
    },
  });
}
