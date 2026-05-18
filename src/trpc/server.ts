"use server";

import { createCallerFactory } from "@/server/trpc/init";
import { createTRPCContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/routers/_app";
import { cache } from "react";

const createCachedContext = cache(createTRPCContext);

const createCaller = createCallerFactory(appRouter);

export const trpc = createCaller(createCachedContext);
