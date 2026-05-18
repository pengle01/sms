import { redirect } from "next/navigation";

// Redirect bare root to the default locale
export default function RootPage() {
  redirect("/el");
}
