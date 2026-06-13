/**
 * Email transport — SMTP via nodemailer.
 *
 * Config is stored in GlobalSetting (admin-configurable), falling back to env:
 *   email_smtp_host  / EMAIL_SMTP_HOST
 *   email_smtp_port  / EMAIL_SMTP_PORT   (default 587)
 *   email_smtp_user  / EMAIL_SMTP_USER
 *   email_smtp_pass  / EMAIL_SMTP_PASS
 *   email_from       / EMAIL_FROM        (e.g. "School <no-reply@school.ac.cy>")
 *
 * When SMTP is not configured the message is logged to the console instead of
 * sent. In development that's enough to complete the OTP flow; in production an
 * unconfigured transport returns success:false so callers can surface an error.
 */
import { db } from "@/server/db";
import { logger, errInfo } from "@/server/logger";

const IS_DEV = process.env.NODE_ENV !== "production";

export interface EmailResult {
  success: boolean;
  error?: string;
}

async function getConfig(): Promise<{
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
} | null> {
  const settings = await db.globalSetting.findMany({
    where: {
      key: { in: ["email_smtp_host", "email_smtp_port", "email_smtp_user", "email_smtp_pass", "email_from"] },
    },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  const host = map["email_smtp_host"] || process.env.EMAIL_SMTP_HOST || "";
  const port = Number(map["email_smtp_port"] || process.env.EMAIL_SMTP_PORT || "587");
  const user = map["email_smtp_user"] || process.env.EMAIL_SMTP_USER || "";
  const pass = map["email_smtp_pass"] || process.env.EMAIL_SMTP_PASS || "";
  const from = map["email_from"] || process.env.EMAIL_FROM || user;

  if (!host || !user || !pass) return null;
  return { host, port, user, pass, from };
}

export async function sendEmail(to: string, subject: string, text: string): Promise<EmailResult> {
  const config = await getConfig();

  if (!config) {
    // In dev the body (incl. the OTP) is intentionally surfaced so the activation
    // flow can be completed without a real SMTP server.
    logger.warn(
      { event: "email.notConfigured", to, subject, ...(IS_DEV ? { body: text } : {}) },
      "Email transport not configured",
    );
    // Allow the flow to proceed locally; block in production.
    return IS_DEV ? { success: true } : { success: false, error: "Email not configured" };
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
    await transporter.sendMail({ from: config.from, to, subject, text });
    return { success: true };
  } catch (err) {
    logger.error({ event: "email.sendFailed", to, subject, err: errInfo(err) }, "Email send failed");
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Sends a verification code for account activation. */
export async function sendOtpEmail(to: string, code: string): Promise<EmailResult> {
  const subject = "Κωδικός επιβεβαίωσης / Verification code";
  const text =
    `Ο κωδικός επιβεβαίωσης για την ενεργοποίηση του λογαριασμού σας είναι: ${code}\n` +
    `Λήγει σε 15 λεπτά.\n\n` +
    `Your account activation verification code is: ${code}\n` +
    `It expires in 15 minutes.`;
  return sendEmail(to, subject, text);
}
