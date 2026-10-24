import { NextRequest, NextResponse } from "next/server";
import { getSuperAdminAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { runPsqlRestore } from "@/server/dbAdmin";
import { restoreNotices } from "@/lib/dataRestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Restores an uploaded .sql dump's data into the current schema via psql: the
// tables keep this version's structure however old the dump is, and the
// differences met (left-out tables/columns, new columns) are reported back.
// SUPER_ADMIN only, guarded by a typed confirmation phrase. POST (not a server
// action) so large dumps aren't capped by the server-action body limit.
export async function POST(req: NextRequest) {
  const auth = await getSuperAdminAuth();
  if (!auth) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  if (String(form.get("confirm") ?? "") !== "RESTORE") {
    return NextResponse.json({ ok: false, error: 'Type RESTORE to confirm.' }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Choose a .sql dump file." }, { status: 400 });
  }
  const sql = Buffer.from(await file.arrayBuffer());

  // Audit before running — the restore may replace our own account.
  await writeAudit({
    userId: auth.userId,
    action: "database.import",
    resource: "Database",
    details: { bytes: sql.length, filename: file.name },
    ...(await requestMeta()),
  });

  try {
    const res = await runPsqlRestore(sql);
    if (res.code !== 0) {
      return NextResponse.json({ ok: false, error: `psql exited ${res.code}: ${res.stderr.slice(-800)}` }, { status: 500 });
    }
    // What did not fit as it was: tables/columns this version no longer has
    // (left out) and new columns (filled with their defaults).
    const notes = restoreNotices(res.stderr);
    return NextResponse.json({
      ok: true,
      message: "Η επαναφορά ολοκληρώθηκε — τα δεδομένα μπήκαν στην τρέχουσα δομή της βάσης.",
      notes,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
