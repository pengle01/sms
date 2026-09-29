import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "el"],
  defaultLocale: "el",
  localePrefix: "always",
  // Greek unless the user picks English (the header switch changes the URL
  // prefix). Without this, an address with no /el or /en followed the browser's
  // language, so an English-language browser landed on English pages.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
