import { db } from "@/server/db";
import { signatureName } from "@/lib/staffName";

/**
 * The school's headmaster, who signs the referral documents (the decision and
 * the parent letter) next to the headteacher: their real name, or "" when there
 * is no active HEADMASTER account (the line is then signed by hand).
 */
export async function getHeadmasterSignature(): Promise<string> {
  const users = await db.user.findMany({
    where: { isActive: true, OR: [{ role: "HEADMASTER" }, { extraRoles: { has: "HEADMASTER" } }] },
    select: { role: true, name: true, nameEl: true, firstName: true, lastName: true },
    orderBy: { createdAt: "asc" },
  });
  return signatureName(users.find((x) => x.role === "HEADMASTER") ?? users[0]);
}
