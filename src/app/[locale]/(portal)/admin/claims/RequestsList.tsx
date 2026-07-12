"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserCheck, UserX, GraduationCap, Undo2, CheckCircle2, XCircle } from "lucide-react";
import type { Role } from "@/generated/prisma/client";
import { fmtDisplayDate } from "@/lib/dates";
import {
  approveRegistrationAction,
  rejectRegistrationAction,
  approveTeacherClaimAction,
  rejectTeacherClaimAction,
  approveChaperoneRequestAction,
  rejectChaperoneRequestAction,
} from "./actions";

export interface PendingUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  staffName?: string;
  createdAt: string;
}

export interface PendingClaim {
  id: string;
  name: string;
  email: string;
  staffName: string;
  createdAt: string;
}

export interface PendingChaperone {
  id: string;
  name: string;
  email: string;
  note?: string;
  students: { id: string; name: string }[];
  createdAt: string;
}

type AnyItem =
  | { kind: "reg"; data: PendingUser }
  | { kind: "claim"; data: PendingClaim }
  | { kind: "chaperone"; data: PendingChaperone };

interface Toast {
  id: string;
  label: string;
  approved: boolean;
}

const UNDO_MS = 5000;

interface Props {
  registrations: PendingUser[];
  teacherClaims: PendingClaim[];
  chaperoneRequests: PendingChaperone[];
}

export function RequestsList({ registrations: initRegs, teacherClaims: initClaims, chaperoneRequests: initChaperones }: Props) {
  const t = useTranslations("adminClaims");
  const tRoles = useTranslations("roles");
  const router = useRouter();
  const [regs, setRegs] = useState(initRegs);
  const [claims, setClaims] = useState(initClaims);
  const [chaperones, setChaperones] = useState(initChaperones);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const restoreFns = useRef<Map<string, () => void>>(new Map());
  const pendingIds = useRef(new Set<string>());

  useEffect(() => {
    setRegs(initRegs.filter((r) => !pendingIds.current.has(r.id)));
  }, [initRegs]);

  useEffect(() => {
    setClaims(initClaims.filter((c) => !pendingIds.current.has(c.id)));
  }, [initClaims]);

  useEffect(() => {
    setChaperones(initChaperones.filter((c) => !pendingIds.current.has(c.id)));
  }, [initChaperones]);

  function schedule(id: string, label: string, approved: boolean, commit: () => Promise<void>, restore: () => void) {
    pendingIds.current.add(id);
    restoreFns.current.set(id, restore);

    const timer = setTimeout(async () => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
      restoreFns.current.delete(id);
      try {
        await commit();
        router.refresh();
      } catch {
        pendingIds.current.delete(id);
        restore();
      }
    }, UNDO_MS);
    timers.current.set(id, timer);

    setToasts((prev) => [...prev, { id, label, approved }]);
  }

  function undo(id: string) {
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
    pendingIds.current.delete(id);
    restoreFns.current.get(id)?.();
    restoreFns.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function approveReg(item: PendingUser) {
    setRegs((prev) => prev.filter((r) => r.id !== item.id));
    schedule(item.id, t("approvedName", { name: item.name }), true,
      () => approveRegistrationAction(item.id, item.role),
      () => setRegs((prev) => [...prev, item].sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
    );
  }

  function rejectReg(item: PendingUser) {
    setRegs((prev) => prev.filter((r) => r.id !== item.id));
    schedule(item.id, t("rejectedName", { name: item.name }), false,
      () => rejectRegistrationAction(item.id),
      () => setRegs((prev) => [...prev, item].sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
    );
  }

  function approveClaim(item: PendingClaim) {
    setClaims((prev) => prev.filter((c) => c.id !== item.id));
    schedule(item.id, t("approvedName", { name: item.name }), true,
      () => approveTeacherClaimAction(item.id),
      () => setClaims((prev) => [...prev, item].sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
    );
  }

  function rejectClaim(item: PendingClaim) {
    setClaims((prev) => prev.filter((c) => c.id !== item.id));
    schedule(item.id, t("rejectedName", { name: item.name }), false,
      () => rejectTeacherClaimAction(item.id),
      () => setClaims((prev) => [...prev, item].sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
    );
  }

  function approveChaperone(item: PendingChaperone) {
    setChaperones((prev) => prev.filter((c) => c.id !== item.id));
    schedule(item.id, t("approvedName", { name: item.name }), true,
      () => approveChaperoneRequestAction(item.id),
      () => setChaperones((prev) => [...prev, item].sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
    );
  }

  function rejectChaperone(item: PendingChaperone) {
    setChaperones((prev) => prev.filter((c) => c.id !== item.id));
    schedule(item.id, t("rejectedName", { name: item.name }), false,
      () => rejectChaperoneRequestAction(item.id),
      () => setChaperones((prev) => [...prev, item].sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
    );
  }

  const allItems: AnyItem[] = [
    ...regs.map((data) => ({ kind: "reg" as const, data })),
    ...claims.map((data) => ({ kind: "claim" as const, data })),
    ...chaperones.map((data) => ({ kind: "chaperone" as const, data })),
  ].sort((a, b) => a.data.createdAt.localeCompare(b.data.createdAt));

  return (
    <>
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
          {allItems.length > 0 && (
            <p className="text-slate-500 mt-1">{t("pendingCount", { count: allItems.length })}</p>
          )}
        </div>

        {allItems.length === 0 && toasts.length === 0 ? (
          <p className="text-slate-400 text-sm py-12 text-center">{t("noPending")}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {allItems.map((entry) => {
              if (entry.kind === "reg") {
                const item = entry.data;
                return (
                  <div key={item.id} className="py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900">{item.name || "—"}</p>
                      <p className="text-sm text-slate-500">{item.email}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{tRoles.has(item.role) ? tRoles(item.role) : item.role}</Badge>
                        {item.staffName && (
                          <Badge className="text-xs bg-blue-50 text-blue-700 border-blue-200 font-mono">{item.staffName}</Badge>
                        )}
                        <span className="text-xs text-slate-400">{fmtDisplayDate(new Date(item.createdAt))}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" onClick={() => approveReg(item)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                        <UserCheck className="w-3.5 h-3.5" /> {t("approve")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => rejectReg(item)} className="border-red-200 text-red-600 hover:bg-red-50 gap-1.5">
                        <UserX className="w-3.5 h-3.5" /> {t("reject")}
                      </Button>
                    </div>
                  </div>
                );
              }

              if (entry.kind === "claim") {
                const item = entry.data;
                return (
                  <div key={item.id} className="py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900">{item.name || "—"}</p>
                      <p className="text-sm text-slate-500">{item.email}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{tRoles("TEACHER")}</Badge>
                        <Badge className="text-xs bg-blue-50 text-blue-700 border-blue-200 font-mono">{item.staffName}</Badge>
                        <span className="text-xs text-slate-400">{fmtDisplayDate(new Date(item.createdAt))}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" onClick={() => approveClaim(item)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                        <UserCheck className="w-3.5 h-3.5" /> {t("approve")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => rejectClaim(item)} className="border-red-200 text-red-600 hover:bg-red-50 gap-1.5">
                        <UserX className="w-3.5 h-3.5" /> {t("reject")}
                      </Button>
                    </div>
                  </div>
                );
              }

              // chaperone
              const item = entry.data;
              return (
                <div key={item.id} className="py-4 flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="font-medium text-slate-900">{item.name || "—"}</p>
                    <p className="text-sm text-slate-500">{item.email}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{tRoles("CHAPERONE")}</Badge>
                      <span className="text-xs text-slate-400">{fmtDisplayDate(new Date(item.createdAt))}</span>
                    </div>
                    {item.note && (
                      <p className="text-sm text-slate-600 italic">"{item.note}"</p>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <GraduationCap className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      {item.students.map((s) => (
                        <Badge key={s.id} variant="outline" className="text-xs">{s.name}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" onClick={() => approveChaperone(item)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" /> {t("approve")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => rejectChaperone(item)} className="border-red-200 text-red-600 hover:bg-red-50 gap-1.5">
                      <UserX className="w-3.5 h-3.5" /> {t("reject")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-80">
          {toasts.map((toast) => (
            <div key={toast.id} className="flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm text-white bg-slate-800 border border-slate-700">
              {toast.approved
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              }
              <span className="flex-1 truncate">{toast.label}</span>
              <button
                onClick={() => undo(toast.id)}
                className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium flex-shrink-0 transition-colors"
              >
                <Undo2 className="w-3.5 h-3.5" /> {t("undo")}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
