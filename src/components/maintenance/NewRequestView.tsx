import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getActiveAuth } from "@/server/authz";
import { getRooms } from "@/server/rooms";
import { canFileMaintenance } from "@/lib/maintenance";
import { NewRequestForm } from "./NewRequestForm";

/** "Report a fault" — shared by the teacher, office and admin portals. */
export async function NewRequestView({ basePath, room }: { basePath: string; room?: string }) {
  const auth = await getActiveAuth();
  if (!auth || !canFileMaintenance(auth.roles)) notFound();

  const t = await getTranslations("maintenance");
  const rooms = (await getRooms()).map((r) => r.name);

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <Link href={basePath} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ChevronLeft className="w-4 h-4" />
          {t("title")}
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">{t("newRequestTitle")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("newRequestHint")}</p>
      </div>
      <Card>
        <CardContent className="p-5">
          <NewRequestForm rooms={rooms} basePath={basePath} defaultRoom={room} />
        </CardContent>
      </Card>
    </div>
  );
}
