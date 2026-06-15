/**
 * SMS gateway wrapper — WebSMS / Cytacom (websms.com.cy REST API).
 *
 * Config is stored in GlobalSetting (admin-configurable):
 *   sms_api_url   — API root, e.g. https://websms.com.cy/api (NOT the /send-sm leaf)
 *   sms_api_key   — API key from websms.com.cy/en/account/api-key
 *   sms_sender_id — Sender label ("from"), 3–11 english chars, no digits-only
 *
 * Falls back to env vars SMS_API_URL / SMS_API_KEY / SMS_SENDER_ID, and to the
 * documented root URL when no endpoint is configured.
 *
 * Per the gateway docs the send call is POST /send-sm with a form body of
 * to/from/key/encoding/message, the phone must use the `357…` form (the `+357`
 * prefix is explicitly rejected), and a JSON `{status:"ok"}` means accepted.
 */
import { db } from "@/server/db";
import { logger, errInfo } from "@/server/logger";
import { toGatewayPhone, pickEncoding, type SmsEncoding } from "@/lib/smsText";

const DEFAULT_ROOT = "https://websms.com.cy/api";

export interface SmsResult {
  success: boolean;
  gatewayResponse?: string;
  error?: string;
  batchId?: number | string;
  credits?: number;
}

async function getConfig(): Promise<{ root: string; apiKey: string; senderId: string } | null> {
  const settings = await db.globalSetting.findMany({
    where: { key: { in: ["sms_api_url", "sms_api_key", "sms_sender_id"] } },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  const apiUrl = map["sms_api_url"] || process.env.SMS_API_URL || DEFAULT_ROOT;
  const apiKey = map["sms_api_key"] || process.env.SMS_API_KEY || "";
  const senderId = map["sms_sender_id"] || process.env.SMS_SENDER_ID || "SCHOOL";

  if (!apiKey) return null;
  return { root: apiRoot(apiUrl), apiKey, senderId };
}

/** Normalise any stored URL to the API root, tolerating a previously-saved
 *  `/send` or `/send-sm` leaf and trailing slashes. */
function apiRoot(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "").replace(/\/(send-sm|send)$/i, "");
  return trimmed || DEFAULT_ROOT;
}

export async function sendSms(
  to: string,
  message: string,
  opts?: { encoding?: SmsEncoding }
): Promise<SmsResult> {
  const config = await getConfig();
  if (!config) {
    logger.warn({ event: "sms.notConfigured" }, "SMS gateway not configured (set sms_api_key in Admin > Settings)");
    return { success: false, error: "SMS not configured" };
  }

  const phone = toGatewayPhone(to);
  if (!phone) return { success: false, error: "Invalid phone number" };

  const encoding = opts?.encoding ?? pickEncoding(message);
  const body = new URLSearchParams({
    to: phone,
    from: config.senderId,
    key: config.apiKey,
    encoding,
    message,
  });

  try {
    const res = await fetch(`${config.root}/send-sm`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const text = await res.text();
    let json: { status?: string; error?: string; batchId?: number | string; credits?: number } | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON gateway response — surfaced via gatewayResponse below */
    }

    if (!res.ok || json?.status !== "ok") {
      const error = json?.error || `HTTP ${res.status}`;
      logger.error({ event: "sms.sendFailed", status: res.status }, `SMS gateway error: ${error}`);
      return { success: false, gatewayResponse: text, error };
    }
    return { success: true, gatewayResponse: text, batchId: json.batchId, credits: json.credits };
  } catch (err) {
    logger.error({ event: "sms.sendError", err: errInfo(err) }, "SMS send failed");
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Account credit balance, or null when not configured / unreachable. */
export async function checkCredits(): Promise<{ credits: number } | null> {
  const config = await getConfig();
  if (!config) return null;
  try {
    const res = await fetch(`${config.root}/get-credits`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key: config.apiKey }).toString(),
    });
    const json = (await res.json()) as { status?: string; credits?: number };
    if (json?.status === "ok") return { credits: Number(json.credits) };
    return null;
  } catch (err) {
    logger.error({ event: "sms.creditsError", err: errInfo(err) }, "SMS credits check failed");
    return null;
  }
}

export async function getSmsConfig() {
  const settings = await db.globalSetting.findMany({
    where: { key: { in: ["sms_api_url", "sms_api_key", "sms_sender_id"] } },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return {
    apiUrl: map["sms_api_url"] ?? "",
    apiKey: map["sms_api_key"] ?? "",
    senderId: map["sms_sender_id"] ?? "",
  };
}
