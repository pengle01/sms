import { z } from "zod";
import { createTRPCRouter, adminProcedure, managementProcedure } from "../init";

export const settingsRouter = createTRPCRouter({
  getAll: managementProcedure.query(({ ctx }) => {
    return ctx.db.globalSetting.findMany();
  }),

  upsert: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.globalSetting.upsert({
        where: { key: input.key },
        create: { key: input.key, value: input.value },
        update: { value: input.value },
      });
    }),

  upsertMany: adminProcedure
    .input(z.array(z.object({ key: z.string(), value: z.string() })))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction(
        input.map((item) =>
          ctx.db.globalSetting.upsert({
            where: { key: item.key },
            create: item,
            update: { value: item.value },
          })
        )
      );
    }),
});
