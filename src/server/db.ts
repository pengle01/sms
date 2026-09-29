import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Lessons a re-imported timetable dropped but that carry attendance history are
 * kept with `removedAt` set (see TimetableSlot in prisma/schema.prisma). Every
 * direct read of lessons is a read of the CURRENT timetable — schedules,
 * dashboards, marking, locate, the substitution engine — so they are filtered
 * here once rather than at ~44 call sites that could each forget.
 *
 * Deliberately not filtered: `findUnique` (the import finds a removed lesson by
 * its class/day/period key to bring it back), writes, and history reached
 * through `Attendance.timetableSlot` — which is what keeps past records whole.
 * Nested reads (`include: { timetableSlots }`) are not covered by query
 * extensions and filter `removedAt: null` themselves.
 *
 * A query that names `removedAt` itself is left alone — the escape hatch for
 * code that genuinely needs removed lessons.
 */
function currentLessonsOnly<T extends { where?: unknown }>(args: T): T {
  const where = args.where as Record<string, unknown> | undefined;
  if (where && "removedAt" in where) return args;
  return { ...args, where: where ? { AND: [{ removedAt: null }, where] } : { removedAt: null } };
}

// Typed as a plain PrismaClient: a query-only extension changes no model or
// result types, and helpers across the app take `PrismaClient` /
// `Prisma.TransactionClient` parameters. Interactive transactions opened on
// the extended client carry the extension too.
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });

  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    query: {
      timetableSlot: {
        findMany: ({ args, query }) => query(currentLessonsOnly(args)),
        findFirst: ({ args, query }) => query(currentLessonsOnly(args)),
        findFirstOrThrow: ({ args, query }) => query(currentLessonsOnly(args)),
        count: ({ args, query }) => query(currentLessonsOnly(args)),
        aggregate: ({ args, query }) => query(currentLessonsOnly(args)),
        groupBy: ({ args, query }) => query(currentLessonsOnly(args)),
      },
    },
  });
  return client as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
