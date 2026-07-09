"use client";

import { useTransition, useState } from "react";
import { unlinkStaffUser, linkStaffUser } from "./actions";
import { Loader2, Check, Unlink, Link2 } from "lucide-react";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  staffProfileId: string;
  linkedUserId: string | null;
  linkedUserName: string | null | undefined;
  availableUsers: UserOption[];
}

export function StaffLinkControls({
  staffProfileId,
  linkedUserId,
  linkedUserName,
  availableUsers,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [showLink, setShowLink] = useState(false);

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleUnlink = () => {
    startTransition(async () => {
      await unlinkStaffUser(staffProfileId);
      flash();
    });
  };

  const handleLink = (userId: string) => {
    if (!userId) return;
    setShowLink(false);
    startTransition(async () => {
      await linkStaffUser(staffProfileId, userId);
      flash();
    });
  };

  return (
    <div className="flex items-center gap-2">
      {linkedUserId ? (
        <>
          <span className="text-sm text-slate-700">{linkedUserName ?? linkedUserId}</span>
          <button
            onClick={handleUnlink}
            disabled={pending}
            title="Αποσύνδεση χρήστη από αυτό το προφίλ"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
          >
            <Unlink className="w-3.5 h-3.5" />
            Αποσύνδεση
          </button>
        </>
      ) : (
        <>
          {showLink ? (
            <select
              autoFocus
              onChange={(e) => handleLink(e.target.value)}
              onBlur={() => setShowLink(false)}
              disabled={pending}
              className="h-8 rounded-lg border border-slate-200 px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="">— Επιλογή χρήστη —</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => setShowLink(true)}
              disabled={pending}
              className="flex items-center gap-1 text-xs text-amber-600 hover:text-emerald-600 transition-colors disabled:opacity-40"
            >
              <Link2 className="w-3.5 h-3.5" />
              Σύνδεση χρήστη
            </button>
          )}
          <span className="text-xs text-amber-500 font-medium">Μη συνδεδεμένο</span>
        </>
      )}
      <div className="w-4 flex-shrink-0">
        {pending && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
        {saved && !pending && <Check className="w-4 h-4 text-emerald-500" />}
      </div>
    </div>
  );
}
