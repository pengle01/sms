import { z } from "zod";
import { createTRPCRouter, staffProcedure, managementProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";

export const studentsRouter = createTRPCRouter({
  list: staffProcedure
    .input(z.object({
      groupId: z.string().optional(),
      search: z.string().optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const where = {
        ...(input.groupId ? { groupId: input.groupId } : {}),
        ...(input.search ? {
          user: { name: { contains: input.search, mode: "insensitive" as const } },
        } : {}),
      };

      const [total, items] = await Promise.all([
        ctx.db.studentProfile.count({ where }),
        ctx.db.studentProfile.findMany({
          where,
          include: {
            user: { select: { id: true, name: true, email: true, isActive: true } },
            group: true,
          },
          orderBy: { user: { name: "asc" } },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
      ]);

      return { items, total, page: input.page };
    }),

  create: managementProcedure
    .input(z.object({
      name: z.string().min(2),
      email: z.string().email(),
      studentId: z.string().min(1),
      groupId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });

      return ctx.db.user.create({
        data: {
          email: input.email,
          name: input.name,
          role: "STUDENT",
          isActive: true,
          studentProfile: {
            create: {
              studentId: input.studentId,
              groupId: input.groupId,
            },
          },
        },
        include: { studentProfile: true },
      });
    }),

  update: managementProcedure
    .input(z.object({
      studentProfileId: z.string(),
      name: z.string().min(2).optional(),
      groupId: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.studentProfile.findUnique({
        where: { id: input.studentProfileId },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.$transaction([
        ...(input.name !== undefined || input.isActive !== undefined
          ? [ctx.db.user.update({
              where: { id: profile.userId },
              data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
              },
            })]
          : []),
        ctx.db.studentProfile.update({
          where: { id: input.studentProfileId },
          data: { groupId: input.groupId },
        }),
      ]);
    }),
});

export const parentsRouter = createTRPCRouter({
  create: managementProcedure
    .input(z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
      phone: z.string().optional(),
      studentProfileIds: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });

      const passwordHash = await bcrypt.hash(input.password, 12);

      return ctx.db.user.create({
        data: {
          email: input.email,
          name: input.name,
          role: "PARENT",
          isActive: true,
          passwordHash,
          parentProfile: {
            create: {
              role: "OTHER" as const,
              phone: input.phone,
              children: {
                create: input.studentProfileIds.map((id) => ({ studentProfileId: id })),
              },
            },
          },
        },
        include: { parentProfile: { include: { children: true } } },
      });
    }),
});
