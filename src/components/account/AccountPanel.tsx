import { db } from "@/server/db";
import { Card, CardContent } from "@/components/ui/card";
import { CircleUser } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ChangePasswordCard } from "./ChangePasswordCard";
import type { Role } from "@/generated/prisma/client";

/**
 * "My account" — who you are signed in as, and a form to change your password.
 *
 * One panel shared by every portal that has no fuller profile page of its own
 * (office, admin, parent, student, chaperone). Educators keep `/teacher/profile`,
 * which already edits their name/phone/department, and render the password card
 * on it directly rather than getting a second page.
 */
export async function AccountPanel({ userId }: { userId: string }) {
  const t = await getTranslations("account");
  const tRoles = await getTranslations("roles");

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, nameEl: true, email: true, role: true },
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
      </div>

      <Card className="max-w-xl">
        <CardContent className="p-5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <CircleUser className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{user?.name ?? "—"}</p>
            <p className="text-sm text-slate-500 break-all">{user?.email}</p>
            {user?.role && (
              <p className="text-xs text-slate-400 mt-0.5">{tRoles(user.role as Role)}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}
