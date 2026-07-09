"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { getNow } from "@/lib/dates";

interface Student {
  id: string;
  studentId: string;
  user: { name: string | null };
}

export function NewReferralDialog({ students, locale }: { students: Student[]; locale: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [description, setDescription] = useState("");

  const { mutate, isPending } = trpc.referrals.create.useMutation({
    onSuccess: () => {
      toast.success("Η παραπομπή υποβλήθηκε");
      setOpen(false);
      setStudentId("");
      setDescription("");
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || description.length < 10) return;
    mutate({ studentIds: [studentId], description, date: getNow().toISOString().split("T")[0]! });
  };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
      >
        <Plus className="w-4 h-4" />
        Νέα Παραπομπή
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Υποβολή Παραπομπής</h3>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Μαθητής</label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="">Επιλέξτε μαθητή…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.user?.name} ({s.studentId})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Περιγραφή</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              minLength={10}
              rows={4}
              placeholder="Περιγράψτε το περιστατικό ή τη συμπεριφορά (τουλ. 10 χαρακτήρες)…"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="h-9 px-4"
            >
              Άκυρο
            </Button>
            <Button
              type="submit"
              disabled={isPending || !studentId || description.length < 10}
              className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Υποβολή
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
