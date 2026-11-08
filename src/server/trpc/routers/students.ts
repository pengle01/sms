import { z } from "zod";
import { createTRPCRouter, managementProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";

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
