import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CircleUser } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { isEducator } from "@/lib/rbac";
import { splitFullName } from "@/lib/profile";
import type { Role } from "@/generated/prisma";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ required?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !isEducator(session.user.role as Role)) redirect(`/${locale}/login`);

  const { required } = await searchParams;
  const t = await getTranslations("profile");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      staffProfile: { select: { phone: true, department: true, pmp: true } },
    },
  });
  if (!user) redirect(`/${locale}/login`);

  const staff = user.staffProfile;

  // Seed the name fields from the stored parts, falling back to a best-effort
  // split of the legacy single `name` for accounts created before the split.
  const fallback = splitFullName(user.name);
  const firstName = user.firstName ?? fallback.firstName;
  const lastName = user.lastName ?? fallback.lastName;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
      </div>

      {required && staff && !staff.pmp && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{t("pmpRequired")}</p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CircleUser className="w-4 h-4" />
            {t("personalInfo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-lg">
            <p className="block text-sm font-medium text-slate-700 mb-1.5">{t("email")}</p>
            <p className="h-10 px-3 flex items-center rounded-lg border border-slate-100 bg-slate-50 text-sm text-slate-500">
              {user.email}
            </p>
            <p className="text-xs text-slate-400 mt-1">{t("emailNote")}</p>
          </div>

          <ProfileForm
            initial={{
              firstName,
              lastName,
              phone: staff?.phone ?? "",
              department: staff?.department ?? "",
              pmp: staff?.pmp ?? "",
            }}
            hasStaffProfile={!!staff}
            // Force the form open when a required ΠΜΠ is still missing.
            mustEdit={!!required && !!staff && !staff.pmp}
          />

          {!staff && <p className="text-xs text-slate-400">{t("noStaffProfile")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
