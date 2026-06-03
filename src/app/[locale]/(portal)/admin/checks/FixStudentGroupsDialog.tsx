"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Wrench, X, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  setStudentHomegroup,
  addStudentToGroup,
  removeStudentFromGroup,
  type FixResult,
} from "./actions";

export interface GroupOption {
  id: string;
  name: string;
  isHomegroup: boolean;
}

export function FixStudentGroupsDialog({
  studentId,
  studentName,
  homegroupId,
  subjectGroups,
  allGroups,
}: {
  studentId: string;
  studentName: string | null;
  homegroupId: string | null;
  subjectGroups: { id: string; name: string }[];
  allGroups: GroupOption[];
}) {
  const t = useTranslations("checks");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addGroupId, setAddGroupId] = useState("");

  const homegroups = allGroups.filter((g) => g.isHomegroup);
  const memberIds = new Set(subjectGroups.map((g) => g.id));
  const addable = allGroups.filter((g) => !memberIds.has(g.id) && g.id !== homegroupId);

  function run(action: () => Promise<FixResult>) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(t("fixApplied"));
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const selectClass =
    "h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white";

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100">
            <Wrench className="w-3.5 h-3.5" />
            {t("fix")}
          </button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{studentName ?? "—"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Homegroup */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">{t("fixHomegroup")}</p>
            <select
              className={`${selectClass} w-full`}
              value={homegroupId ?? ""}
              disabled={pending}
              onChange={(e) =>
                run(() => setStudentHomegroup(studentId, e.target.value || null))
              }
            >
              <option value="">{t("fixNoHomegroup")}</option>
              {homegroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {/* Subject groups */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">{t("fixSubjectGroups")}</p>
            {subjectGroups.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {subjectGroups.map((g) => (
                  <span
                    key={g.id}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 pl-2 pr-1 py-0.5 text-xs text-slate-700"
                  >
                    {g.name}
                    <button
                      type="button"
                      disabled={pending}
                      title={t("fixRemove")}
                      onClick={() => run(() => removeStudentFromGroup(studentId, g.id))}
                      className="rounded p-0.5 text-slate-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 mb-2">{t("fixNoSubjectGroups")}</p>
            )}

            <div className="flex gap-2">
              <select
                className={`${selectClass} flex-1`}
                value={addGroupId}
                disabled={pending}
                onChange={(e) => setAddGroupId(e.target.value)}
              >
                <option value="">{t("fixPickGroup")}</option>
                {addable.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={pending || !addGroupId}
                onClick={() => {
                  const id = addGroupId;
                  setAddGroupId("");
                  run(() => addStudentToGroup(studentId, id));
                }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {t("fixAdd")}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
