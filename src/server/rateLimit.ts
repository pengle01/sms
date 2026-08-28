// Simple in-process rate limiter. Adequate for a single long-lived Node server
// (this app's deployment model). For multi-instance/serverless, back this with
// Redis or a database table instead.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map can't grow unbounded.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
}

/**
 * Returns true if the action is allowed, false if the limit is exceeded.
 * Counts an attempt when allowed.
 */
export function rateLimit(key: string, max = 5, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

// ── Policy ───────────────────────────────────────────────────────────────────
//
// Public sign-up endpoints are reached by a whole school from ONE public IP:
// every device on the school network shares the site's NAT address. Keying a
// tight limit on that address throttles the building, not the abuser — five
// registrations an hour would stall staff onboarding after the fifth person.
//
// So each of these is limited in two tiers: a tight one on the actor (the email
// being registered, the access code being claimed), which is what actually stops
// someone hammering a single target, and a wide one on the IP that only exists
// to stop a flood. Both are needed — the actor key alone is caller-supplied and
// can be varied freely.

const HOUR = 60 * 60 * 1000;

export type LimitTier = "actor" | "ip";
export type LimitVerdict = { allowed: true } | { allowed: false; tier: LimitTier };

/**
 * Apply an actor limit and an IP limit together.
 *
 * The IP gate is consulted first so a flood is rejected before it can burn
 * through actor budgets. A rejection by the second tier still counts an attempt
 * against the first; at these sizes that over-count is not worth a two-phase
 * commit.
 */
export function allowTwoTier(opts: {
  scope: string;
  actor: string;
  ip: string;
  actorMax: number;
  ipMax: number;
  windowMs?: number;
}): LimitVerdict {
  const windowMs = opts.windowMs ?? HOUR;
  if (!rateLimit(`${opts.scope}-ip:${opts.ip}`, opts.ipMax, windowMs)) {
    return { allowed: false, tier: "ip" };
  }
  if (!rateLimit(`${opts.scope}:${opts.actor}`, opts.actorMax, windowMs)) {
    return { allowed: false, tier: "actor" };
  }
  return { allowed: true };
}

/** Self-registration: 5/h per email, 60/h per IP (a full staff room can sign up). */
export function allowRegistration(ip: string, email: string): LimitVerdict {
  return allowTwoTier({ scope: "register", actor: email, ip, actorMax: 5, ipMax: 60 });
}

/** Account activation: 10/h per access code, 60/h per IP (a class can activate together). */
export function allowActivation(ip: string, code: string): LimitVerdict {
  return allowTwoTier({ scope: "activate", actor: code, ip, actorMax: 10, ipMax: 60 });
}

/**
 * Access-code lookup — the code-enumeration surface, so this one stays keyed on
 * the IP alone: an attacker varies the code, which makes it useless as an actor
 * key. The cap is generous because guessing is already infeasible on entropy
 * (8 characters over a 31-symbol alphabet, ~40 bits; with ~1000 live codes a
 * guess lands with probability ~1e-9). The limit is here to stop a flood, not
 * to be the thing standing between an attacker and a valid code.
 */
export function allowActivationCheck(ip: string): boolean {
  return rateLimit(`activate-check-ip:${ip}`, 150, HOUR);
}
