import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TRPCProvider } from "@/trpc/provider";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "School Management System",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "greek"],
});

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
    <html lang={locale} className={`${inter.variable} h-full`}>
      <body className="min-h-full antialiased bg-background text-foreground font-[family-name:var(--font-inter)]">
        <NextIntlClientProvider messages={messages}>
          <TRPCProvider>
            {children}
            <Toaster richColors position="top-right" />
          </TRPCProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
