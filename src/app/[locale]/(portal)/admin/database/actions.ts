"use server";

import { getSuperAdminAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { truncateAllExceptAdmin } from "@/server/dbAdmin";

export type DbResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Wipe ALL application data, keeping only the acting admin's account so they
 * stay signed in. Guarded by a typed confirmation phrase + audit.
 */
export async function truncateDatabase(formData: FormData): Promise<DbResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Forbidden" };
  if (String(formData.get("confirm") ?? "") !== "WIPE") {
    return { ok: false, error: "Type WIPE to confirm." };
  }
  try {
    const tables = await truncateAllExceptAdmin(auth.userId);
    await writeAudit({
      userId: auth.userId,
      action: "database.truncate",
      resource: "Database",
      details: { tables },
      ...(await requestMeta()),
    });
    return { ok: true, message: `Wiped ${tables} tables. Your admin account was kept.` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
