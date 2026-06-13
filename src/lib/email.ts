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

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

const EMAIL_KEYS = [
  "email_smtp_host",
  "email_smtp_port",
  "email_smtp_user",
  "email_smtp_pass",
  "email_from",
  "email_from_name",
] as const;

// The envelope sender address: an explicit From, else the auth user — but only
// if that looks like an email (e.g. Resend's username is the literal "resend").
function senderAddress(cfg: SmtpConfig): string {
  const explicit = (cfg.from || "").trim();
  if (explicit) return explicit;
  const user = cfg.user.trim();
  return user.includes("@") ? user : "";
}

// Compose a formal From: "School Name <address>".
function buildFrom(cfg: SmtpConfig): string {
  const addr = senderAddress(cfg);
  const name = cfg.fromName.replace(/"/g, "").trim();
  return name ? `"${name}" <${addr}>` : addr;
}

async function getConfig(): Promise<SmtpConfig | null> {
  const settings = await db.globalSetting.findMany({ where: { key: { in: [...EMAIL_KEYS] } } });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  const host = map["email_smtp_host"] || process.env.EMAIL_SMTP_HOST || "";
  const port = Number(map["email_smtp_port"] || process.env.EMAIL_SMTP_PORT || "587");
  const user = map["email_smtp_user"] || process.env.EMAIL_SMTP_USER || "";
  const pass = map["email_smtp_pass"] || process.env.EMAIL_SMTP_PASS || "";
  const from = map["email_from"] || process.env.EMAIL_FROM || user;
  const fromName = map["email_from_name"] || process.env.EMAIL_FROM_NAME || "";

  if (!host || !user || !pass) return null;
  return { host, port, user, pass, from, fromName };
}

/** Stored config for the admin settings form (admin-only callers). */
export async function getEmailConfig(): Promise<{
  host: string;
  port: string;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}> {
  const settings = await db.globalSetting.findMany({ where: { key: { in: [...EMAIL_KEYS] } } });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return {
    host: map["email_smtp_host"] ?? "",
    port: map["email_smtp_port"] ?? "",
    user: map["email_smtp_user"] ?? "",
    pass: map["email_smtp_pass"] ?? "",
    from: map["email_from"] ?? "",
    fromName: map["email_from_name"] ?? "",
  };
}

async function sendVia(cfg: SmtpConfig, to: string, subject: string, text: string): Promise<EmailResult> {
  if (!senderAddress(cfg)) {
    return {
      success: false,
      error: "Set a valid From address (the username isn't an email — e.g. use onboarding@resend.dev to test).",
    };
  }
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465, // 465 = implicit TLS; 587 = STARTTLS (M365/Gmail)
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transporter.sendMail({ from: buildFrom(cfg), to, subject, text });
    return { success: true };
  } catch (err) {
    logger.error({ event: "email.sendFailed", to, subject, err: errInfo(err) }, "Email send failed");
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
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

  return sendVia(config, to, subject, text);
}

/** Send a test message through an explicitly-provided config (admin "send test"). */
export async function sendTestEmail(cfg: SmtpConfig, to: string): Promise<EmailResult> {
  if (!cfg.host || !cfg.user || !cfg.pass) {
    return { success: false, error: "Συμπληρώστε host, χρήστη και κωδικό πρώτα." };
  }
  if (!to.trim()) return { success: false, error: "Δώστε διεύθυνση παραλήπτη." };
  return sendVia(
    cfg,
    to.trim(),
    "Δοκιμαστικό email / Test email",
    "Δοκιμαστικό μήνυμα από το School Management System.\n\nThis is a test email from the School Management System. If you received it, email is configured correctly.",
  );
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
