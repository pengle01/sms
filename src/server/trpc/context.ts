import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import type { Session } from "next-auth";

export interface Context {
  session: Session | null;
  db: typeof db;
  req?: Request;
}

export async function createTRPCContext(opts?: {
  req?: Request;
}): Promise<Context> {
  const session = await getServerSession(authOptions);
  return {
    session,
    db,
    req: opts?.req,
  };
}
