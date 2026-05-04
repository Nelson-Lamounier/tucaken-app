# Dockerfile for tucaken-app (TanStack Start Admin Dashboard)
# Multi-stage build using Amazon Linux 2023 for K8s parity
#
# TanStack Start uses Vite SSR build.
# Build output lands in dist/ with client + server bundles.

# ── Stage 1: Base (Node.js on Amazon Linux 2023) ──────────────────
FROM amazonlinux:2023 AS base

# Install Node.js 22 LTS and shadow-utils (groupadd/useradd) via dnf
RUN dnf install -y nodejs22 nodejs22-npm shadow-utils && \
  dnf clean all && \
  npm install -g corepack && \
  corepack enable

# ── Stage 2: Install dependencies ─────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./

RUN yarn install --immutable

# ── Stage 3: Build the TanStack Start application ─────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

RUN yarn build

# ── Stage 4: Production runner (Amazon Linux 2023) ────────────────
FROM amazonlinux:2023 AS runner
WORKDIR /app

RUN dnf install -y nodejs22 shadow-utils && \
  dnf clean all

ENV NODE_ENV=production

# Non-root user
RUN groupadd --system --gid 1001 nodejs && \
  useradd --system --uid 1001 --gid nodejs startadmin

# Vite SSR build output
COPY --from=builder --chown=startadmin:nodejs /app/dist ./dist

# node_modules at /app for ESM resolution (Node ESM resolver walks the
# directory hierarchy looking for node_modules folders).
COPY --from=builder --chown=startadmin:nodejs /app/node_modules ./node_modules

# Production server runner + OTel preload bundle.
# telemetry.js is a separate esbuild output (see package.json `build`); it
# externalises @opentelemetry/* so `node --import` can register the import-
# in-the-middle hook before server.js evaluates http/undici/fetch.
# 444 = read-only for owner + group + other; no write permission assigned.
COPY --from=builder --chown=startadmin:nodejs --chmod=444 /app/server.js    ./server.js
COPY --from=builder --chown=startadmin:nodejs --chmod=444 /app/telemetry.js ./telemetry.js

# start.sh: conditionally preloads OTel only when OTEL_EXPORTER_OTLP_ENDPOINT
# is set. CI has no collector → plain `node server.js`. K8s prod has the env
# var → `node --import ./telemetry.js server.js` for full instrumentation.
# 555 = read+execute for owner + group + other; no write permission assigned.
COPY --chown=startadmin:nodejs --chmod=555 start.sh ./start.sh

# ESM resolution: server.js uses `import` — needs "type": "module" in chain.
RUN echo '{"type":"module"}' > /app/package.json && chown startadmin:nodejs /app/package.json

USER startadmin

EXPOSE 5001
ENV PORT=5001
ENV HOST="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "import('http').then(h => h.default.get('http://localhost:' + (process.env.PORT || 5001) + '/livez', r => process.exit(r.statusCode < 500 ? 0 : 1)))" || exit 1

CMD ["/bin/sh", "./start.sh"]
