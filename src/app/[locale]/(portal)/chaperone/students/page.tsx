import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, Clock, CheckCircle2, XCircle, Plus } from "lucide-react";
import { fmtDisplayDate } from "@/lib/dates";
import Link from "next/link";

const STATUS_CONFIG = {
  PENDING: { label: "Pending approval", icon: Clock, color: "text-amber-600 bg-amber-50 border-amber-200" },
  APPROVED: { label: "Approved", icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  REJECTED: { label: "Rejected", icon: XCircle, color: "text-red-600 bg-red-50 border-red-200" },
} as const;

export default async function ChaperoneStudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ requested?: string }>;
}) {
  const { locale } = await params;
  const { requested } = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "CHAPERONE") redirect(`/${locale}/login`);

  const requests = await db.chaperoneRequest.findMany({
    where: { userId: session.user.id },
    include: {
      students: {
        include: {
          studentProfile: {
            include: {
              user: { select: { name: true } },
              group: { select: { name: true } },
            },
          },
        },
        orderBy: { studentProfile: { user: { name: "asc" } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const hasApproved = requests.some((r) => r.status === "APPROVED");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">My Students</h2>
          <p className="text-slate-500 mt-1">Students you have been approved to accompany.</p>
        </div>
        <Link href={`/${locale}/chaperone/request`}>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
            <Plus className="w-4 h-4" />
            New request
          </Button>
        </Link>
      </div>

      {requested === "1" && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3">
          <Clock className="w-4 h-4 flex-shrink-0" />
          Your request has been submitted and is pending administrator approval.
        </div>
      )}

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <GraduationCap className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-slate-500 text-sm">No student requests yet.</p>
            <Link href={`/${locale}/chaperone/request`}>
              <Button variant="outline" size="sm" className="mt-2">Submit your first request</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const cfg = STATUS_CONFIG[req.status];
            const Icon = cfg.icon;
            return (
              <Card key={req.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="text-sm font-medium text-slate-700">
                        Submitted {fmtDisplayDate(new Date(req.createdAt))}
                      </CardTitle>
                      {req.note && (
                        <p className="text-sm text-slate-500 italic">"{req.note}"</p>
                      )}
                    </div>
                    <Badge variant="outline" className={`text-xs flex-shrink-0 flex items-center gap-1 ${cfg.color}`}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-slate-100">
                    {req.students.map(({ studentProfile: sp }) => (
                      <div key={sp.id} className="py-2 flex items-center justify-between">
                        <span className="text-sm text-slate-700">{sp.user?.name ?? "—"}</span>
                        {sp.group && (
                          <span className="text-xs text-slate-400 font-mono">{sp.group.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
