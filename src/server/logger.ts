import pino from "pino";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Centralised structured logger (JSON). Writes to BOTH stdout and a file on disk
// (rotated by logrotate — see ops/logrotate/sms). No pino `transport` is used so
// there are no worker threads to trip up the Next.js bundler; `pino` is also
// listed in serverExternalPackages in next.config.ts.
//
// PII discipline: never log raw emails/phones/passwords/OTPs/tokens — the redact
// rules below scrub them if they ever slip into a log object, but prefer logging
// stable ids (userId) over personal data in the first place.

const level = (process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug")) as pino.Level;
const logDir = process.env.LOG_DIR ?? join(process.cwd(), "logs");

function buildLogger(): pino.Logger {
  const streams: pino.StreamEntry[] = [{ level, stream: process.stdout }];

  // Persist to a file as well. Best-effort: a read-only FS just falls back to
  // stdout-only rather than crashing the server on boot.
  try {
    mkdirSync(logDir, { recursive: true });
    streams.push({
      level,
      stream: pino.destination({ dest: join(logDir, "app.log"), mkdir: true, sync: true }),
    });
  } catch {
    // stdout stream already covers us
  }

  return pino(
    {
      level,
      base: { app: "sms", env: process.env.NODE_ENV ?? "development" },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: {
        paths: [
          "password",
          "passwordHash",
          "token",
          "otp",
          "email",
          "phone",
          "*.password",
          "*.passwordHash",
          "*.token",
          "*.otp",
          "*.email",
          "*.phone",
          "req.headers.cookie",
          "req.headers.authorization",
        ],
        remove: true,
      },
    },
    pino.multistream(streams),
  );
}

// Reuse a single instance across dev HMR reloads so we don't open a new file
// descriptor on every hot reload.
const g = globalThis as unknown as { __smsLogger?: pino.Logger };
export const logger: pino.Logger = g.__smsLogger ?? buildLogger();
if (process.env.NODE_ENV !== "production") g.__smsLogger = logger;

/** A child logger with fixed bindings (e.g. a module/component name). */
export function getLogger(bindings: pino.Bindings): pino.Logger {
  return logger.child(bindings);
}

/** Normalise an unknown caught value into a log-friendly error shape. */
export function errInfo(e: unknown): { message: string; name?: string; stack?: string } {
  if (e instanceof Error) return { message: e.message, name: e.name, stack: e.stack };
  return { message: String(e) };
}
