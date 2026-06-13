import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "../init";
import { writeAudit } from "@/server/audit";
import { sendTestEmail } from "@/lib/email";

function reqMeta(req?: Request) {
  const fwd = req?.headers.get("x-forwarded-for");
  return {
    ipAddress: fwd ? fwd.split(",")[0]!.trim() : req?.headers.get("x-real-ip") ?? null,
    userAgent: req?.headers.get("user-agent") ?? null,
  };
}

export const settingsRouter = createTRPCRouter({
  // Admin-only: GlobalSetting can hold secrets (e.g. sms_api_key), so never
  // expose it to non-admins.
  getAll: adminProcedure.query(({ ctx }) => {
    return ctx.db.globalSetting.findMany();
  }),

  upsert: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db.globalSetting.upsert({
        where: { key: input.key },
        create: { key: input.key, value: input.value },
        update: { value: input.value },
      });
      await writeAudit({
        userId: ctx.session.user.id,
        action: "settings.upsert",
        resource: "GlobalSetting",
        resourceId: input.key,
        ...reqMeta(ctx.req),
      });
      return res;
    }),

  upsertMany: adminProcedure
    .input(z.array(z.object({ key: z.string(), value: z.string() })))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db.$transaction(
        input.map((item) =>
          ctx.db.globalSetting.upsert({
            where: { key: item.key },
            create: item,
            update: { value: item.value },
          })
        )
      );
      await writeAudit({
        userId: ctx.session.user.id,
        action: "settings.upsertMany",
        resource: "GlobalSetting",
        details: { keys: input.map((i) => i.key) },
        ...reqMeta(ctx.req),
      });
      return res;
    }),

  // Send a test email with the supplied (possibly unsaved) SMTP config so the
  // admin can verify settings before persisting. Never logs the password.
  sendTestEmail: adminProcedure
    .input(
      z.object({
        host: z.string(),
        port: z.coerce.number().int().positive(),
        user: z.string(),
        pass: z.string(),
        from: z.string(),
        fromName: z.string(),
        to: z.string().email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { to, ...cfg } = input;
      const result = await sendTestEmail(cfg, to);
      await writeAudit({
        userId: ctx.session.user.id,
        action: "settings.testEmail",
        resource: "GlobalSetting",
        details: { to, success: result.success },
        ...reqMeta(ctx.req),
      });
      return result;
    }),
});
