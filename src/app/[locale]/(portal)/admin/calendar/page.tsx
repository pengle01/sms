import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarClient } from "./CalendarClient";

export default async function AdminCalendarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login/staff`);

  const t = await getTranslations("calendar");

  const specialDays = await db.specialDay.findMany({
    orderBy: [{ startDate: "asc" }, { type: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
      </div>
      <CalendarClient specialDays={specialDays} />
    </div>
  );
}
