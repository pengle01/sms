import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPeriodsPerDay, DEFAULT_PERIODS_PER_DAY } from "@/lib/schoolConfig";

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/login`);

  const { PeriodsForm } = await import("./PeriodsForm");
  const periodsPerDay = await getPeriodsPerDay();
  const initial = { ...DEFAULT_PERIODS_PER_DAY, ...periodsPerDay };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
        <p className="text-slate-500 text-sm mt-1">School-wide configuration</p>
      </div>

      <Card className="max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Periods per Day</CardTitle>
        </CardHeader>
        <CardContent>
          <PeriodsForm initial={initial} />
        </CardContent>
      </Card>
    </div>
  );
}
