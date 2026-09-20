# syntax=docker/dockerfile:1
#
# SMS app image, built on the server by `docker compose build` (see compose.yaml).
#
# No secrets enter the image: .env* is excluded by .dockerignore, and the
# build-time placeholders below exist only inside a single RUN step.

FROM node:22-bookworm-slim AS base
# openssl  — Prisma's schema engine, used by `prisma db push`.
# tzdata   — the app reads local wall-clock time (absence-SMS cutoff, attendance
#            "locate"), so the container must run on school time, not UTC.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
ENV TZ=Asia/Nicosia \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---- dependencies ------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---- build -------------------------------------------------------------------
FROM deps AS build
COPY . .
# Inlined into the bundles at build time. Empty means the real clock.
ARG NEXT_PUBLIC_TEST_DATE=""
# next build imports src/server/auth.ts, which refuses to load without a
# NEXTAUTH_SECRET; nothing connects to the database. Both values are
# placeholders scoped to this RUN — they are not ENV and do not reach the runtime image.
RUN if [ -z "$NEXT_PUBLIC_TEST_DATE" ]; then unset NEXT_PUBLIC_TEST_DATE; fi \
 && export DATABASE_URL="postgresql://build:build@127.0.0.1:1/build" \
           NEXTAUTH_SECRET="build-placeholder-not-a-secret" \
 && npx prisma generate \
 && npm run build \
 && rm -rf .next/cache

# ---- runtime -----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOADS_DIR=/data/uploads \
    LOG_DIR=/data/logs
# Full node_modules: the prisma CLI (and dotenv, which prisma.config.ts imports)
# are needed at runtime for `prisma db push`.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json /app/next.config.ts /app/prisma.config.ts /app/tsconfig.json ./
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/messages ./messages
COPY --from=build /app/src ./src
# Code stays root-owned and read-only; the app user can write only .next (cache) and /data.
COPY --from=build --chown=node:node /app/.next ./.next
RUN mkdir -p /data/uploads /data/logs && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
