import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database } from "lucide-react";
import { databaseStats } from "@/server/dbAdmin";
import { DatabaseTools } from "./DatabaseTools";

export default async function AdminDatabasePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login`);

  const [stats, users, students] = await Promise.all([
    databaseStats().catch(() => ({ tables: 0 })),
    db.user.count().catch(() => 0),
    db.studentProfile.count().catch(() => 0),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Database className="w-6 h-6 text-slate-500" />
          Database
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Export, restore, or wipe the entire database. SUPER_ADMIN only — handle with care.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Current state</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-8 text-sm">
          <div><span className="text-2xl font-bold text-slate-900">{stats.tables}</span><p className="text-slate-500">tables</p></div>
          <div><span className="text-2xl font-bold text-slate-900">{users}</span><p className="text-slate-500">users</p></div>
          <div><span className="text-2xl font-bold text-slate-900">{students}</span><p className="text-slate-500">students</p></div>
        </CardContent>
      </Card>

      <DatabaseTools locale={locale} />
    </div>
  );
}
