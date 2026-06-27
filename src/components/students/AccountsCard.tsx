"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { GraduationCap, Users, KeyRound, Link2Off, Loader2, Eye, EyeOff, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  setAccountPassword,
  unclaimStudent,
  unlinkGuardian,
  type AccountActionResult,
} from "./account-actions";

export type StudentAccount = {
  userId: string;
  name: string | null;
  email: string;
  isActive: boolean;
  hasPassword: boolean;
  kind: "student" | "guardian";
  role?: string;
  parentProfileId?: string;
};

const iconBtn = "h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40";

export function AccountsCard({
  studentProfileId,
  accounts,
  guardianClaims,
  maxGuardians,
}: {
  studentProfileId: string;
  accounts: StudentAccount[];
  guardianClaims: number;
  maxGuardians: number;
}) {
  const [pending, startTransition] = useTransition();
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);

  const run = (fn: () => Promise<AccountActionResult>, okMsg: string, onOk?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); onOk?.(); }
      else toast.error(res.error);
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-slate-400" />
            Accounts
          </span>
          <Badge variant="outline" className="text-xs font-normal text-slate-500">
            Guardians {guardianClaims}/{maxGuardians}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 divide-y divide-slate-50">
        {accounts.map((a) => (
          <div key={a.userId} className="px-5 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {a.kind === "student"
                    ? <GraduationCap className="w-4 h-4 text-emerald-500 shrink-0" />
                    : <Users className="w-4 h-4 text-slate-400 shrink-0" />}
                  <span className="font-medium text-slate-900 truncate">{a.name ?? "—"}</span>
                  {a.kind === "student"
                    ? <Badge variant="outline" className="text-[10px]">student</Badge>
                    : a.role && <Badge variant="outline" className="text-[10px] capitalize">{a.role.toLowerCase()}</Badge>}
                  {!a.isActive && (
                    <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">Inactive</Badge>
                  )}
                  {!a.hasPassword && (
                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200">No password</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {a.email.endsWith("@pending.sms") ? "— (no email)" : a.email}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title="Set / reset password"
                  onClick={() => { setPwFor(pwFor === a.userId ? null : a.userId); setPw(""); setConfirmUnlink(null); }}
                  className={`${iconBtn} text-slate-400 hover:text-slate-700`}
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                {confirmUnlink === a.userId ? (
                  <>
                    <button
                      type="button"
                      title="Confirm"
                      disabled={pending}
                      onClick={() => run(
                        () => a.kind === "student"
                          ? unclaimStudent(studentProfileId)
                          : unlinkGuardian(studentProfileId, a.parentProfileId!),
                        a.kind === "student" ? "Student un-claimed — they can re-activate with their code" : "Guardian unlinked",
                        () => setConfirmUnlink(null),
                      )}
                      className={`${iconBtn} text-red-600 hover:bg-red-50`}
                    >
                      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button type="button" title="Cancel" onClick={() => setConfirmUnlink(null)} className={`${iconBtn} text-slate-400`}>
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    title={a.kind === "student" ? "Un-claim (reset so they can re-activate)" : "Unlink guardian"}
                    onClick={() => { setConfirmUnlink(a.userId); setPwFor(null); }}
                    className={`${iconBtn} text-slate-400 hover:text-red-600`}
                  >
                    <Link2Off className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {pwFor === a.userId && (
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="New password (min 8 characters)"
                    autoComplete="new-password"
                    className="w-full h-9 pl-3 pr-9 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  disabled={pending || pw.length < 8}
                  onClick={() => run(() => setAccountPassword(a.userId, pw), "Password set", () => { setPwFor(null); setPw(""); })}
                  className="h-9 px-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Set
                </button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
