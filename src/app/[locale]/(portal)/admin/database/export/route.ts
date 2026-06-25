import { NextResponse } from "next/server";
import { getSuperAdminAuth } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import { runPgDump } from "@/server/dbAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streams a full pg_dump (.sql) of the database as a download. SUPER_ADMIN only.
export async function GET() {
  const auth = await getSuperAdminAuth();
  if (!auth) return new NextResponse("Forbidden", { status: 403 });

  let result;
  try {
    result = await runPgDump();
  } catch (e) {
    return new NextResponse(`pg_dump unavailable: ${(e as Error).message}`, { status: 500 });
  }
  if (result.code !== 0) {
    return new NextResponse(`pg_dump failed: ${result.stderr.slice(0, 1000)}`, { status: 500 });
  }

  await writeAudit({
    userId: auth.userId,
    action: "database.export",
    resource: "Database",
    details: { bytes: result.stdout.length },
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return new NextResponse(new Uint8Array(result.stdout), {
    headers: {
      "Content-Type": "application/sql; charset=utf-8",
      "Content-Disposition": `attachment; filename="sms-backup-${stamp}.sql"`,
      "Cache-Control": "no-store",
    },
  });
}
