"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { WARN_BEFORE_MS, REFRESH_EVERY_MS } from "@/lib/sessionPolicy";

interface Status {
  serverNow: number;
  lastSeen: number;
  idleMin: number | null;
  absoluteEnd: number | null;
}

/**
 * Staff idle timer (teacher, office and admin portals). The server decides —
 * the proxy refuses an idle or over-long session on its own — this component
 * just makes it humane:
 *   - typing/clicking without changing page counts as activity (POST ping, at
 *     most once a minute), so a long register isn't cut off mid-way;
 *   - a minute before the idle limit, a warning with «stay logged in»;
 *   - before logging out it asks the server (GET), because another tab may
 *     have kept the session alive.
 * Deadlines are kept relative to the server's clock, so a wrong PC clock
 * doesn't matter.
 */
export function SessionTimeout({ locale }: { locale: string }) {
  const t = useTranslations("session");
  const [warnLeft, setWarnLeft] = useState<number | null>(null);
  const idleDeadline = useRef<number | null>(null); // local ms
  const hardDeadline = useRef<number | null>(null); // local ms
  const lastPing = useRef(0);
  const activeSincePing = useRef(false);

  const logout = useCallback(
    (reason: "idle" | "expired") => {
      window.location.href = `/api/logout?locale=${locale}&reason=${reason}`;
    },
    [locale],
  );

  const apply = useCallback((s: Status) => {
    const offset = Date.now() - s.serverNow; // local - server
    idleDeadline.current = s.idleMin === null ? null : s.lastSeen + s.idleMin * 60_000 + offset;
    hardDeadline.current = s.absoluteEnd === null ? null : s.absoluteEnd + offset;
  }, []);

  const call = useCallback(
    async (method: "GET" | "POST"): Promise<boolean> => {
      try {
        const res = await fetch("/api/session/ping", { method, cache: "no-store" });
        if (res.status === 401) {
          const body = (await res.json().catch(() => ({}))) as { state?: string };
          logout(body.state === "expired" ? "expired" : "idle");
          return false;
        }
        if (!res.ok) return true; // network/server hiccup: don't log anyone out over it
        apply((await res.json()) as Status);
        if (method === "POST") lastPing.current = Date.now();
        return true;
      } catch {
        return true;
      }
    },
    [apply, logout],
  );

  // Initial state, and activity listeners.
  useEffect(() => {
    void call("GET");
    const mark = () => {
      activeSincePing.current = true;
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, mark));
  }, [call]);

  // One ticker: report activity, show the warning, log out at the limit.
  useEffect(() => {
    const iv = setInterval(async () => {
      const now = Date.now();
      if (activeSincePing.current && now - lastPing.current >= REFRESH_EVERY_MS) {
        activeSincePing.current = false;
        await call("POST");
      }
      const hard = hardDeadline.current;
      if (hard !== null && now >= hard) return logout("expired");
      const idle = idleDeadline.current;
      if (idle === null) return setWarnLeft(null);
      const left = idle - now;
      if (left <= 0) {
        // Another tab may have been active — ask before acting.
        const stillOk = await call("GET");
        if (stillOk && idleDeadline.current !== null && idleDeadline.current - Date.now() <= 0) logout("idle");
        return;
      }
      setWarnLeft(left <= WARN_BEFORE_MS ? Math.ceil(left / 1000) : null);
    }, 1000);
    return () => clearInterval(iv);
  }, [call, logout]);

  if (warnLeft === null) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4" role="alertdialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-start gap-3">
          <Clock className="w-6 h-6 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-slate-900">{t("warnTitle")}</p>
            <p className="text-sm text-slate-600 mt-1">{t("warnBody", { seconds: warnLeft })}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => logout("idle")}
            className="h-9 px-4 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
          >
            {t("logoutNow")}
          </button>
          <button
            type="button"
            autoFocus
            onClick={async () => {
              activeSincePing.current = false;
              if (await call("POST")) setWarnLeft(null);
            }}
            className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
          >
            {t("stay")}
          </button>
        </div>
      </div>
    </div>
  );
}
