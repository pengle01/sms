import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Users, GraduationCap, Briefcase, ChevronRight } from "lucide-react";
import { LoginShell, LOGIN_BACKGROUNDS, redirectIfSignedIn } from "./LoginShell";

// The chooser: parents, students and staff each have their own login page.
// Old links and bookmarks to /login land here.
export default async function LoginChooserPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await redirectIfSignedIn(locale);
  const t = await getTranslations("auth");
  const otherLocale = locale === "el" ? "en" : "el";

  const choices = [
    { href: "parent", label: t("parentLogin"), icon: Users, tone: "border-sky-300/40 bg-sky-400/15 hover:bg-sky-400/25" },
    { href: "student", label: t("studentLogin"), icon: GraduationCap, tone: "border-lime-300/40 bg-lime-400/10 hover:bg-lime-400/20" },
    { href: "staff", label: t("staffLogin"), icon: Briefcase, tone: "border-white/20 bg-white/10 hover:bg-white/15" },
  ] as const;

  return (
    <LoginShell title={t("chooseTitle")} background={LOGIN_BACKGROUNDS.chooser}>
      <div className="space-y-5">
        <div className="flex justify-end gap-1">
          <span className="text-xs px-3 py-1.5 rounded-full bg-white/20 text-white font-semibold">
            {locale === "el" ? "ΕΛ" : "EN"}
          </span>
          <a
            href={`/${otherLocale}/login`}
            className="text-xs px-3 py-1.5 rounded-full text-emerald-300/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            {locale === "el" ? "EN" : "ΕΛ"}
          </a>
        </div>
        <p className="text-center text-sm text-emerald-200/80">{t("chooseHint")}</p>
        <div className="space-y-3">
          {choices.map(({ href, label, icon: Icon, tone }) => (
            <Link
              key={href}
              href={`/${locale}/login/${href}`}
              className={`flex items-center gap-4 rounded-2xl border px-5 py-4 text-white font-semibold transition-colors ${tone}`}
            >
              <Icon className="w-6 h-6 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="w-5 h-5 opacity-60" />
            </Link>
          ))}
        </div>
      </div>
    </LoginShell>
  );
}
