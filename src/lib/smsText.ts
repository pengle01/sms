// Pure SMS text helpers — encoding detection, segment counting, phone
// formatting for the WebSMS (Cytacom) gateway. No server/DB/React imports so
// these can be reused by the live character counter in the client console and
// unit-tested directly.
export type SmsEncoding = "GSM" | "UCS2";

// GSM 03.38 default alphabet (basic set). Note the Greek uppercase letters that
// have no Latin look-alike (Δ Φ Γ Λ Ω Π Ψ Σ Θ Ξ) are present; the rest of the
// Greek alphabet and any accented/lowercase Greek fall outside GSM and force
// UCS2 — which is what we want for correct, readable Greek.
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// Extension-table characters: each occupies two GSM septets.
const GSM_EXT = "^{}\\[~]|€";

const BASIC = new Set([...GSM_BASIC]);
const EXT = new Set([...GSM_EXT]);

/** True when every character can be represented in the GSM 03.38 alphabet. */
export function isGsmEncodable(message: string): boolean {
  for (const ch of message) {
    if (!BASIC.has(ch) && !EXT.has(ch)) return false;
  }
  return true;
}

/** Cheapest encoding that represents the message: GSM when possible (typically
 *  Latin-only), otherwise UCS2 (any Greek/accents/emoji). */
export function pickEncoding(message: string): SmsEncoding {
  return isGsmEncodable(message) ? "GSM" : "UCS2";
}

/** Length in gateway "characters": GSM counts extension chars as two; UCS2
 *  counts Unicode code points. */
function unitLength(message: string, encoding: SmsEncoding): number {
  if (encoding === "UCS2") return [...message].length;
  let n = 0;
  for (const ch of message) n += EXT.has(ch) ? 2 : 1;
  return n;
}

export interface SmsSegmentInfo {
  encoding: SmsEncoding;
  /** Character units consumed (see unitLength). */
  length: number;
  /** Number of SMS segments (0 for an empty message). */
  segments: number;
  /** Per-segment capacity used for the current message. */
  perSegment: number;
  /** The gateway accepts up to 3 segments per send. */
  overLimit: boolean;
}

// Per the gateway docs: GSM 160 / 306 / 459 (i.e. 153/segment when multipart);
// UCS2 70 / 134 / 201 (67/segment when multipart).
const LIMITS: Record<SmsEncoding, { single: number; multi: number }> = {
  GSM: { single: 160, multi: 153 },
  UCS2: { single: 70, multi: 67 },
};

/** Compute character/segment counts for the live counter. `encoding` may be
 *  forced; otherwise it is auto-detected from the message. */
export function smsSegmentInfo(message: string, encoding?: SmsEncoding): SmsSegmentInfo {
  const enc = encoding ?? pickEncoding(message);
  const len = unitLength(message, enc);
  const { single, multi } = LIMITS[enc];
  const segments = len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi);
  return {
    encoding: enc,
    length: len,
    segments,
    perSegment: segments <= 1 ? single : multi,
    overLimit: segments > 3,
  };
}

/** Convert a raw phone to the gateway's required `357XXXXXXXX` form (the API
 *  rejects the `+357` prefix). Tolerates "+357…", "00357…", "357…" and bare
 *  local numbers. Returns "" when no digits remain. */
export function toGatewayPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = raw.replace(/\D/g, ""); // digits only (drops +, spaces, punctuation)
  d = d.replace(/^0+/, ""); // drop leading zeros, incl. the 00 international prefix
  if (d.startsWith("357")) d = d.slice(3); // drop the Cyprus country code if present
  if (!d) return "";
  return `357${d}`;
}

/** Drop targets that resolve to the same phone number, so a parent of several
 *  selected students (or in a broadcast) receives a message only once. Keeps
 *  the first occurrence. */
export function dedupeByPhone<T extends { phone: string }>(targets: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of targets) {
    const key = toGatewayPhone(t.phone); // collapse every format to one canonical key
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
