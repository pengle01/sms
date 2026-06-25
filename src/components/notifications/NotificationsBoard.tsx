"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Bell, FileWarning, CheckCircle2, CheckCheck, Clock, MessageSquare, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, React.ReactNode> = {
  REFERRAL_CREATED: <FileWarning className="w-5 h-5 text-amber-500" />,
  REFERRAL_RESOLVED: <CheckCircle2 className="w-5 h-5 text-green-500" />,
  STAFF_MESSAGE: <MessageSquare className="w-5 h-5 text-emerald-500" />,
  SPECIAL_ED_UPDATE: <ShieldAlert className="w-5 h-5 text-amber-500" />,
};

function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "μόλις τώρα";
  if (mins < 60) return `πριν ${mins} λεπτ.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `πριν ${hours} ώρ.`;
  const days = Math.floor(hours / 24);
  return `πριν ${days} ημ.`;
}

function fmtDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function NotificationsBoard({ locale }: { locale: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"active" | "noticed">("active");

  const { data, refetch, isLoading } = trpc.notifications.listPage.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const { mutate: markNoticed } = trpc.notifications.markNoticed.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });

  const { mutate: markAllNoticed, isPending: markingAll } = trpc.notifications.markAllNoticed.useMutation({
    onSuccess: () => {
      toast.success("Όλες οι ειδοποιήσεις σημειώθηκαν");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleNotificationClick = (id: string, linkUrl: string | null) => {
    if (linkUrl) router.push(`/${locale}${linkUrl}`);
  };

  const active = data?.active ?? [];
  const noticed = data?.noticed ?? [];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("active")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            tab === "active"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          Εκκρεμείς
          {active.length > 0 && (
            <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[11px] font-bold px-1">
              {active.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("noticed")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            tab === "noticed"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          Ειδοποιήθηκαν
        </button>
      </div>

      {/* Active tab */}
      {tab === "active" && (
        <div className="space-y-3">
          {active.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={() => markAllNoticed()}
                disabled={markingAll}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Σήμανση όλων ως ειδοποιημένων
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Φόρτωση…</div>
          ) : active.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 py-16 text-center">
              <Bell className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-400 text-sm">Δεν υπάρχουν εκκρεμείς ειδοποιήσεις</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
              {active.map((n) => (
                <div key={n.id} className="flex items-start gap-4 px-5 py-4">
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {TYPE_ICON[n.type] ?? <Bell className="w-5 h-5 text-slate-400" />}
                  </div>

                  {/* Content */}
                  <div
                    className={cn("flex-1 min-w-0", n.linkUrl && "cursor-pointer")}
                    onClick={() => n.linkUrl && handleNotificationClick(n.id, n.linkUrl)}
                  >
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    {n.body && <p className="text-sm text-slate-500 mt-0.5">{n.body}</p>}
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {relativeTime(n.createdAt)}
                    </p>
                  </div>

                  {/* Notice button */}
                  <button
                    onClick={() => markNoticed({ id: n.id })}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 text-slate-500 text-xs font-medium transition-colors touch-manipulation"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Σημείωση
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Noticed tab */}
      {tab === "noticed" && (
        <div>
          {isLoading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Φόρτωση…</div>
          ) : noticed.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 py-16 text-center">
              <CheckCheck className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-400 text-sm">Δεν υπάρχουν ειδοποιήσεις που έχουν σημειωθεί</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
              {noticed.map((n) => (
                <div key={n.id} className="flex items-start gap-4 px-5 py-4 opacity-70">
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {TYPE_ICON[n.type] ?? <Bell className="w-5 h-5 text-slate-400" />}
                  </div>

                  {/* Content */}
                  <div
                    className={cn("flex-1 min-w-0", n.linkUrl && "cursor-pointer")}
                    onClick={() => n.linkUrl && handleNotificationClick(n.id, n.linkUrl)}
                  >
                    <p className="text-sm font-semibold text-slate-700">{n.title}</p>
                    {n.body && <p className="text-sm text-slate-400 mt-0.5">{n.body}</p>}
                    <p className="text-xs text-slate-400 mt-1">{relativeTime(n.createdAt)}</p>
                  </div>

                  {/* Noticed date */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-slate-400 font-medium">Σημειώθηκε</p>
                    <p className="text-xs text-slate-500">{fmtDateTime(n.noticedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
