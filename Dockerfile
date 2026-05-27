# syntax=docker/dockerfile:1.7
# ============================================================================
# Stage 1 — deps: install npm packages with cached layer
# ============================================================================
FROM node:22-alpine AS deps
WORKDIR /app

# Bring the ui-kit source up; npm install resolves the file: dependency.
COPY sentry-ui-kit/package.json sentry-ui-kit/package-lock.json* ./sentry-ui-kit/
COPY sentry-frontend/package.json sentry-frontend/package-lock.json* ./sentry-frontend/

# Build the ui-kit first (its `file:` consumer needs dist/)
WORKDIR /app/sentry-ui-kit
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY sentry-ui-kit ./
RUN npm run build

# Install frontend deps (which now sees ../sentry-ui-kit/dist)
WORKDIR /app/sentry-frontend
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ============================================================================
# Stage 2 — builder: Next.js production build (standalone output)
# ============================================================================
FROM node:22-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Copy everything (deps + source for both packages)
COPY --from=deps /app/sentry-ui-kit /app/sentry-ui-kit
COPY --from=deps /app/sentry-frontend/node_modules /app/sentry-frontend/node_modules
COPY sentry-frontend /app/sentry-frontend

WORKDIR /app/sentry-frontend
RUN npm run build

# ============================================================================
# Stage 3 — runtime: minimal node image with the standalone server
# ============================================================================
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache curl

# Non-root user for the runtime
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Standalone server + static assets + public
COPY --from=builder --chown=nextjs:nodejs /app/sentry-frontend/.next/standalone /app/
COPY --from=builder --chown=nextjs:nodejs /app/sentry-frontend/.next/static /app/sentry-frontend/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/sentry-frontend/public /app/sentry-frontend/public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT:-3000}/ -o /dev/null || exit 1

# Railway sets PORT dynamically; the standalone server reads it from env.
CMD ["node", "sentry-frontend/server.js"]
