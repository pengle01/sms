import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { submitTeacherClaimAction } from "./actions";

export default async function TeacherSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { submitted, error } = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "TEACHER") redirect(`/${locale}/login`);

  const profile = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (profile) redirect(`/${locale}/teacher/dashboard`);

  // Check existing claim
  const existing = await db.teacherClaim.findUnique({ where: { userId: session.user.id } });

  if (existing?.status === "PENDING" || submitted === "1") {
    return (
      <div className="max-w-lg mx-auto mt-16 space-y-4">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Clock className="w-10 h-10 text-amber-500 mx-auto" />
            <h2 className="text-lg font-semibold text-slate-900">Claim pending approval</h2>
            <p className="text-sm text-slate-500">
              Your claim for <span className="font-mono font-semibold">{existing?.staffName}</span> has
              been submitted and is waiting for administrator approval.
            </p>
            <p className="text-xs text-slate-400">You will have full access once approved.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (existing?.status === "REJECTED") {
    // Allow re-submission after rejection
  }

  // Get distinct unclaimed staff names from timetable
  const slots = await db.timetableSlot.findMany({
    where: { staffId: null, staffName: { not: null } },
    select: { staffName: true },
    distinct: ["staffName"],
    orderBy: { staffName: "asc" },
  });
  const staffNames = slots.map((s) => s.staffName!).filter(Boolean);

  return (
    <div className="max-w-xl mx-auto mt-16 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900">Welcome, {session.user.name}</h2>
        <p className="text-slate-500 mt-1 text-sm">
          Select your name as it appears in the teaching schedule to link your account to your timetable.
        </p>
      </div>

      {error === "notfound" && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          That name has already been claimed or does not exist in the schedule.
        </div>
      )}

      {existing?.status === "REJECTED" && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Your previous claim was rejected. Please select again or contact an administrator.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select your name from the schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {staffNames.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">
              All schedule names have already been claimed.
            </p>
          ) : (
            <form action={submitTeacherClaimAction} className="space-y-4">
              <input type="hidden" name="locale" value={locale} />
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border rounded-lg">
                {staffNames.map((name) => (
                  <label
                    key={name}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 has-[:checked]:bg-emerald-50 has-[:checked]:border-l-2 has-[:checked]:border-emerald-500"
                  >
                    <input type="radio" name="staffName" value={name} required className="accent-emerald-600" />
                    <span className="font-mono text-sm text-slate-800">{name}</span>
                  </label>
                ))}
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                Submit claim for approval
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-slate-400">
        Don't see your name?{" "}
        <span className="text-slate-500">Contact the system administrator — your schedule may not have been imported yet.</span>
      </p>
    </div>
  );
}
