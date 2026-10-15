import { sendEmail } from "@/lib/email";
import { logger } from "@/server/logger";

/**
 * Tell an address that the login email changed. Best effort: a mail outage
 * never undoes or blocks the change itself.
 */
export async function notifyEmailChanged(to: string, newEmail: string): Promise<void> {
  try {
    const res = await sendEmail(
      to,
      "Αλλαγή email σύνδεσης",
      `Το email σύνδεσης του λογαριασμού σας στο σύστημα του σχολείου άλλαξε σε: ${newEmail}\n\n` +
        "Αν δεν κάνατε εσείς αυτή την αλλαγή, επικοινωνήστε αμέσως με το σχολείο.",
    );
    if (!res.success) logger.warn({ event: "account.emailChangeNoticeFailed", error: res.error }, "Email-change notice not sent");
  } catch (e) {
    logger.warn({ event: "account.emailChangeNoticeFailed", error: String(e) }, "Email-change notice not sent");
  }
}
