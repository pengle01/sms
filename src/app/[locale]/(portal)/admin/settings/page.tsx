import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPeriodsPerDay, DEFAULT_PERIODS_PER_DAY, getMaxTestsPerWeek, DEFAULT_MAX_TESTS_PER_WEEK } from "@/lib/schoolConfig";
import { getSmsConfig } from "@/lib/sms";

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/login`);

  const { PeriodsForm } = await import("./PeriodsForm");
  const { MaxTestsForm } = await import("./MaxTestsForm");
  const { SmsSettingsForm } = await import("./SmsSettingsForm");
  const [periodsPerDay, maxTestsPerWeek, smsConfig] = await Promise.all([
    getPeriodsPerDay(),
    getMaxTestsPerWeek(),
    getSmsConfig(),
  ]);
  const initial = { ...DEFAULT_PERIODS_PER_DAY, ...periodsPerDay };
  const maxTestsInitial = maxTestsPerWeek ?? DEFAULT_MAX_TESTS_PER_WEEK;

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

      <Card className="max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Test Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <MaxTestsForm initial={maxTestsInitial} />
        </CardContent>
      </Card>

      <Card className="max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">SMS Gateway (WebSMS / Cytacom)</CardTitle>
        </CardHeader>
        <CardContent>
          <SmsSettingsForm initial={smsConfig} />
        </CardContent>
      </Card>
    </div>
  );
}
