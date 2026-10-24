import { redirect } from "next/navigation";
import { LOCATE_KEYS } from "@/lib/studentSearch";

/** «Εντοπισμός Μαθητή/τριας» moved into «Πού βρίσκεται;» — old links and bookmarks land there, filters kept. */
export default async function OldLocatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const sp = new URLSearchParams();
  for (const key of LOCATE_KEYS) {
    const v = query[key];
    if (v) sp.set(key, v);
  }
  const qs = sp.toString();
  redirect(`/${locale}/teacher/whereabouts/students${qs ? `?${qs}` : ""}`);
}
