# syntax=docker/dockerfile:1.7
# ============================================================================
# Single-repo build for Railway. The ui-kit is a separate public repo
# (file: dependency), so we clone + build it at image-build time as a sibling
# directory, which makes `file:../sentry-ui-kit` resolve. No GitHub Packages
# auth required. No BuildKit cache mounts (Railway's builder rejects them).
# ============================================================================

# ----------------------------------------------------------------------------
# Stage 1 — deps: build ui-kit, install frontend deps
# ----------------------------------------------------------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache git
WORKDIR /app

# Build the public ui-kit as a sibling so `file:../sentry-ui-kit` resolves.
# Pinned to a tag for reproducible builds (bump deliberately on ui-kit release).
ARG UI_KIT_REF=v0.1.0
RUN git clone --depth 1 --branch "${UI_KIT_REF}" \
      https://github.com/Chipmo-Sentry/sentry-ui-kit.git sentry-ui-kit \
    && cd sentry-ui-kit \
    && npm ci --no-audit --no-fund \
    && npm run build

WORKDIR /app/sentry-frontend
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ----------------------------------------------------------------------------
# Stage 2 — builder: Next.js production build (standalone output)
# ----------------------------------------------------------------------------
FROM node:22-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* vars are inlined at BUILD time — Railway passes service
# variables as build args, so declare the ones the client bundle needs.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ARG NEXT_PUBLIC_MEDIAMTX_HLS_BASE
ENV NEXT_PUBLIC_MEDIAMTX_HLS_BASE=${NEXT_PUBLIC_MEDIAMTX_HLS_BASE}

COPY --from=deps /app/sentry-ui-kit /app/sentry-ui-kit
COPY --from=deps /app/sentry-frontend/node_modules /app/sentry-frontend/node_modules
COPY . /app/sentry-frontend

WORKDIR /app/sentry-frontend
RUN npm run build

# ----------------------------------------------------------------------------
# Stage 3 — runtime: minimal node image with the standalone server
# ----------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache curl

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Next traces the app (lockfile at /app/sentry-frontend) as the standalone
# root, so server.js + .next live at the standalone ROOT → land at /app.
COPY --from=builder --chown=nextjs:nodejs /app/sentry-frontend/.next/standalone /app/
COPY --from=builder --chown=nextjs:nodejs /app/sentry-frontend/.next/static /app/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/sentry-frontend/public /app/public

USER nextjs

EXPOSE 3000

# Probe a real public 200 page (/ redirects via middleware).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT:-3000}/login -o /dev/null || exit 1

CMD ["node", "server.js"]
