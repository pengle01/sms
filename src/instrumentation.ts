import type { Instrumentation } from "next";

// Runs once when a server instance boots.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("@/server/logger");
    // A faked "today" must never be a silent property of a deployment: it shows
    // in the log as well as on every page (TestDateBanner).
    const { testDateOverride } = await import("@/lib/dates");
    const testDate = testDateOverride();
    if (testDate) {
      logger.warn(
        { event: "server.start", testDate },
        `SMS server started with a FAKED date (${testDate}) — NEXT_PUBLIC_TEST_DATE is set`,
      );
    } else {
      logger.info({ event: "server.start" }, "SMS server started");
    }
    // Optional one-time admin password seed (ADMIN_BOOTSTRAP_EMAIL/PASSWORD).
    const { bootstrapAdminPassword } = await import("@/server/adminBootstrap");
    await bootstrapAdminPassword();
  }
}

// Central capture for ALL unhandled server errors — Server Components, Route
// Handlers, and Server Actions all flow through here (Next.js >= 15). The logger
// is imported lazily and only in the Node runtime so pino never reaches the Edge
// bundle.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger, errInfo } = await import("@/server/logger");
  const e = err as { digest?: string } & Error;
  logger.error(
    {
      event: "request.error",
      err: { ...errInfo(e), digest: e.digest },
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
    },
    `Unhandled error in ${context.routeType} ${request.path}`,
  );
};
