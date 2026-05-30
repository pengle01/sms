/**
 * SMS gateway wrapper — WebSMS (cytacom.com).
 *
 * Required env vars:
 *   SMS_API_URL    e.g. https://api.websms.com.cy/api/send
 *   SMS_API_KEY    API key obtained from websms.com.cy/en/account/api-key
 *   SMS_SENDER_ID  Sender name shown on recipient's phone (default: SCHOOL)
 */

export interface SmsResult {
  success: boolean;
  gatewayResponse?: string;
  error?: string;
}

export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const apiUrl = process.env.SMS_API_URL;
  const apiKey = process.env.SMS_API_KEY;
  const senderId = process.env.SMS_SENDER_ID ?? "SCHOOL";

  if (!apiUrl || !apiKey) {
    console.warn("[SMS] SMS_API_URL or SMS_API_KEY not configured — skipping send.");
    return { success: false, error: "SMS gateway not configured" };
  }

  // Normalise Cypriot phone numbers to international format
  const normalised = to.startsWith("+") ? to : `+357${to.replace(/^0/, "")}`;

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        recipients: [normalised],
        message,
        senderId,
      }),
    });

    const body = await res.text();
    if (!res.ok) {
      return { success: false, gatewayResponse: body, error: `HTTP ${res.status}` };
    }
    return { success: true, gatewayResponse: body };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
