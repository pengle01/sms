/**
 * SMS gateway wrapper — WebSMS / Cytacom (websms.com.cy).
 *
 * Config is stored in GlobalSetting (admin-configurable):
 *   sms_api_url   — POST endpoint, e.g. https://api.websms.com.cy/api/send
 *   sms_api_key   — API key from websms.com.cy/en/account/api-key
 *   sms_sender_id — Sender label shown to recipient (max 11 chars)
 *
 * Falls back to env vars SMS_API_URL / SMS_API_KEY / SMS_SENDER_ID if DB
 * settings are not set.
 */
import { db } from "@/server/db";

export interface SmsResult {
  success: boolean;
  gatewayResponse?: string;
  error?: string;
}

async function getConfig(): Promise<{ apiUrl: string; apiKey: string; senderId: string } | null> {
  const settings = await db.globalSetting.findMany({
    where: { key: { in: ["sms_api_url", "sms_api_key", "sms_sender_id"] } },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  const apiUrl = map["sms_api_url"] || process.env.SMS_API_URL || "";
  const apiKey = map["sms_api_key"] || process.env.SMS_API_KEY || "";
  const senderId = map["sms_sender_id"] || process.env.SMS_SENDER_ID || "SCHOOL";

  if (!apiUrl || !apiKey) return null;
  return { apiUrl, apiKey, senderId };
}

export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const config = await getConfig();
  if (!config) {
    console.warn("[SMS] Not configured — set sms_api_url and sms_api_key in Admin > Settings.");
    return { success: false, error: "SMS not configured" };
  }

  // Normalise to international format for Cyprus
  const normalised = to.startsWith("+") ? to : `+357${to.replace(/^0/, "")}`;

  try {
    const res = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        recipients: [normalised],
        message,
        senderId: config.senderId,
      }),
    });

    const body = await res.text();
    if (!res.ok) return { success: false, gatewayResponse: body, error: `HTTP ${res.status}` };
    return { success: true, gatewayResponse: body };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
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
