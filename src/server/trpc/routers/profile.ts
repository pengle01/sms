import { createTRPCRouter, protectedProcedure } from "../init";
import { profileIncomplete } from "@/lib/profile";

export const profileRouter = createTRPCRouter({
  /**
   * Whether the signed-in staff member still owes first-login profile
   * completion. Drives the portal-wide <ProfileGuard/> overlay; non-staff
   * users (and teachers still in the claim/setup flow) are never gated here.
   */
  completeness: protectedProcedure.query(async ({ ctx }) => {
    const staff = await ctx.db.staffProfile.findUnique({
      where: { userId: ctx.session.user.id },
      select: {
        pmp: true,
        phone: true,
        department: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!staff) return { incomplete: false };
    return {
      incomplete: profileIncomplete({
        pmp: staff.pmp,
        phone: staff.phone,
        department: staff.department,
        firstName: staff.user?.firstName ?? null,
        lastName: staff.user?.lastName ?? null,
      }),
    };
  }),
});
