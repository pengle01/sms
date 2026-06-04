import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarClient } from "./CalendarClient";

export default async function AdminCalendarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/login`);

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
