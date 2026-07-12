import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Context } from "./context";
import { canViewCounselorNotes, isManagement, isStaff } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/client";
import { logger } from "@/server/logger";

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

// Applied to every procedure: times the call, logs failures (server faults at
// error level with a stack, client faults like UNAUTHORIZED/FORBIDDEN/validation
// at warn), and flags slow calls. Errors are still thrown to the client as usual.
const loggingMiddleware = t.middleware(async ({ ctx, path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;
  const userId = ctx.session?.user?.id;

  if (!result.ok) {
    const { code, message, stack } = result.error;
    const serverFault = code === "INTERNAL_SERVER_ERROR" || code === "PARSE_ERROR";
    logger[serverFault ? "error" : "warn"](
      {
        event: "trpc.error",
        path,
        type,
        code,
        durationMs,
        userId,
        ...(serverFault ? { err: { message, stack } } : {}),
      },
      `tRPC ${type} ${path} failed: ${code}`,
    );
  } else if (durationMs > 1000) {
    logger.warn({ event: "trpc.slow", path, type, durationMs, userId }, `Slow tRPC ${type} ${path}: ${durationMs}ms`);
  }

  return result;
});

export const publicProcedure = t.procedure.use(loggingMiddleware);

// Requires any authenticated user. Re-validates against the DB on every call so
// that deactivated accounts lose access immediately and role changes take effect
// without waiting for the JWT to expire (the role in the token is just a login
// snapshot). The fresh role is written back into ctx for downstream guards.
export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { isActive: true, role: true, extraRoles: true },
  });
  if (!user || !user.isActive) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Account inactive" });
  }
  const session = { ...ctx.session, user: { ...ctx.session.user, role: user.role } };
  // Primary + admin-granted extra roles (currently only SUPER_ADMIN).
  const effectiveRoles: Role[] = [user.role, ...user.extraRoles.filter((r) => r !== user.role)];
  return next({ ctx: { ...ctx, session, effectiveRoles } });
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

// Requires super admin (primary role or an admin-granted extra role)
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.effectiveRoles.includes("SUPER_ADMIN")) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

// Counselor + headmaster only (for private notes). Effective roles so an
// extra SUPER_ADMIN grant matches a primary one.
export const counselorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.effectiveRoles.some(canViewCounselorNotes)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});
