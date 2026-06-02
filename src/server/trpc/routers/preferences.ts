import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

export const COLOR_THEMES = ["emerald", "ocean", "violet", "rose", "amber"] as const;
export const FONT_SIZES = ["small", "medium", "large"] as const;

export const preferencesRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { colorTheme: true, fontSize: true },
    });
    return {
      colorTheme: user?.colorTheme ?? "emerald",
      fontSize: user?.fontSize ?? "small",
    };
  }),

  update: protectedProcedure
    .input(
      z.object({
        colorTheme: z.enum(COLOR_THEMES).optional(),
        fontSize: z.enum(FONT_SIZES).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: {
          ...(input.colorTheme ? { colorTheme: input.colorTheme } : {}),
          ...(input.fontSize ? { fontSize: input.fontSize } : {}),
        },
        select: { colorTheme: true, fontSize: true },
      });
      return user;
    }),
});
