"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Admin-only: generates an access code for every active student that doesn't
// have one yet. Existing codes are untouched.
export function GenerateAllCodesButton({ missing }: { missing: number }) {
  const router = useRouter();
  const generateAll = trpc.accessCodes.generateAll.useMutation({
    onSuccess: ({ created }) => {
      toast.success(`Generated ${created} access code${created !== 1 ? "s" : ""}`);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  if (missing === 0) return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <button
            disabled={generateAll.isPending}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            {generateAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Generate access codes ({missing})
          </button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Generate access codes</AlertDialogTitle>
          <AlertDialogDescription>
            This will create an access code for {missing} student{missing !== 1 ? "s" : ""} that
            {missing !== 1 ? " don't" : " doesn't"} have one yet. Existing codes are not changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => generateAll.mutate()}>Generate</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
