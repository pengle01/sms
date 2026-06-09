"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, FileWarning, CheckCircle2, LockOpen, MessageSquare } from "lucide-react";
import { trpc } from "@/trpc/client";
import { cn } from "@/lib/utils";

function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "μόλις τώρα";
  if (mins < 60) return `${mins} λεπτ. πριν`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ώρ. πριν`;
  const days = Math.floor(hours / 24);
  return `${days} ημ. πριν`;
}

export function NotificationBell({ locale }: { locale: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: notifications = [], refetch } = trpc.notifications.list.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const unread = notifications.filter((n) => !n.read).length;

  const { mutate: markRead } = trpc.notifications.markRead.useMutation({
    onSuccess: () => refetch(),
  });
  const { mutate: markAllRead } = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => refetch(),
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleNotificationClick = (id: string, linkUrl: string | null) => {
    markRead({ id });
    setOpen(false);
    if (linkUrl) {
      router.push(`/${locale}${linkUrl}`);
    }
  };

  const icon = (type: string) => {
    if (type === "REFERRAL_CREATED") return <FileWarning className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    if (type === "REFERRAL_RESOLVED") return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />;
    if (type.startsWith("RESOLUTION_UNLOCK")) return <LockOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    if (type === "MESSAGE") return <MessageSquare className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
    return <Bell className="w-4 h-4 text-slate-400 flex-shrink-0" />;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex items-center justify-center w-9 h-9 rounded-full transition-colors",
          open ? "bg-slate-100" : "hover:bg-slate-100"
        )}
        aria-label="Ειδοποιήσεις"
      >
        <Bell className="w-5 h-5 text-slate-500" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-0.5 leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        // On phones the bell sits mid-header and a right-anchored 320px panel
        // bleeds off the left edge — span the viewport instead; from sm up,
        // anchor to the bell as before.
        <div className="fixed inset-x-3 top-14 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-800">Ειδοποιήσεις</span>
            {unread > 0 && (
              <button
                onClick={() => markAllRead()}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Όλες ως αναγνωσμένες
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">
                Δεν υπάρχουν ειδοποιήσεις
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n.id, n.linkUrl)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors",
                    !n.read && "bg-blue-50/50"
                  )}
                >
                  <div className="mt-0.5">{icon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm leading-snug", n.read ? "text-slate-600" : "text-slate-900 font-medium")}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <p className="text-[10px] text-slate-300 mt-1">{relativeTime(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
