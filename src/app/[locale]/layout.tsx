import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Toaster } from "@/components/ui/sonner";
import { TRPCProvider } from "@/trpc/provider";
import { LocaleSetter } from "./locale-setter";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "en" | "el")) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <TRPCProvider>
        <LocaleSetter locale={locale} />
        {children}
        <Toaster richColors position="top-right" />
      </TRPCProvider>
    </NextIntlClientProvider>
  );
}
