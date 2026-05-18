import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Context } from "./context";
import { canViewCounselorNotes, isManagement, isStaff } from "@/lib/rbac";
import type { Role } from "@/generated/prisma";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

// Requires any authenticated user
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

// Requires staff role
export const staffProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isStaff(ctx.session.user.role as Role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

// Requires management role (headmaster+)
export const managementProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isManagement(ctx.session.user.role as Role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

// Requires super admin
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== "SUPER_ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

// Counselor + headmaster only (for private notes)
export const counselorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!canViewCounselorNotes(ctx.session.user.role as Role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});
