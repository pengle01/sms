import { headers } from "next/headers";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma";

type AuditEntry = {
  userId: string;
  action: string; // e.g. "user.role.approve", "student.update", "referral.resolve"
  resource: string; // e.g. "User", "StudentProfile", "Referral"
  resourceId?: string | null;
  details?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/** Records a sensitive action. Never throws — auditing must not break the op. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        ...(entry.details !== undefined ? { details: entry.details } : {}),
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] failed to write audit log", e);
  }
}

/** Best-effort client metadata from the current request headers (server actions). */
export async function requestMeta(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    return {
      ipAddress: fwd ? fwd.split(",")[0]!.trim() : h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}
