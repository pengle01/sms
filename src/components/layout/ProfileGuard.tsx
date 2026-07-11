"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserRound } from "lucide-react";
import { trpc } from "@/trpc/client";

/**
 * First-login profile completion gate. A full-screen blocking overlay across
 * the WHOLE teacher portal while name/phone/department/ΠΜΠ are missing — the
 * dashboard's server redirect alone is escapable, because sidebar links are
 * client-side navigations that never re-render the gating page. Same pattern
 * as <AttendanceLockGuard/>: client-side so it re-evaluates on every
 * navigation via usePathname().
 *
 * The profile page itself is exempt (it's where the data gets filled), as is
 * the setup/claim flow (no StaffProfile yet — a different gate handles it).
 * Saving the profile invalidates the query, which lifts the overlay.
 */
export function ProfileGuard({ locale }: { locale: string }) {
  const t = useTranslations("profile");
  const pathname = usePathname();
  const exempt = pathname.includes("/teacher/profile") || pathname.includes("/teacher/setup");

  const { data } = trpc.profile.completeness.useQuery(undefined, {
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  if (exempt || !data?.incomplete) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-sm p-4 md:p-8">
      <div className="max-w-lg mx-auto mt-16 rounded-2xl border border-amber-300 bg-white shadow-lg p-6 space-y-4">
        <div className="flex items-start gap-3">
          <UserRound className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t("guardTitle")}</h2>
            <p className="text-sm text-slate-600 mt-1">{t("guardBody")}</p>
          </div>
        </div>
        <Link
          href={`/${locale}/teacher/profile?required=1`}
          className="inline-flex items-center h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
        >
          {t("guardCta")}
        </Link>
      </div>
    </div>
  );
}
