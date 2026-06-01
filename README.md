# sentry-frontend

Customer dashboard for **Chipmo Sentry** — Next.js 15 App Router + React 19 + [sentry-ui-kit](https://github.com/Chipmo-Sentry/sentry-ui-kit). Talks to [sentry-backend](https://github.com/Chipmo-Sentry/sentry-backend) over cookie-authenticated REST.

Apache 2.0

---

## What ships in M1

- **Login** (`/login`) — email + password → httpOnly cookie from backend
- **App shell** — `Topbar` (page title, notification bell, user menu) + responsive
  `Sidebar` (desktop rail + mobile drawer), role-gated nav (super-admin → `/admin`)
- **Dashboard** (`/dashboard`) — alert counts by level, 7-day trend, recent review list
- **Live** (`/live`) — HLS camera tiles + Canvas bbox/risk overlay, driven by `/api/v1/cameras`
- **Clip upload** (`/clips/upload`) — drag-drop mp4, store selector, posts to `/api/v1/clips`
- **Alerts** (`/alerts`) — level filter + text search + offset pagination, real-time SSE,
  TP/FP/unclear feedback with confirmation
- **Alert detail** (`/alerts/[id]`) — clip player + inline feedback
- **Behaviors** (`/behaviors`) — 6-dim weights + risk thresholds editor (PATCH)
- **Management** — Stores / Cameras full CRUD; **Admin** orgs + user invite (super-admin)
- **Real-time** — single shared SSE (`AlertStreamProvider`) + global notification layer
  (browser notification, beep, tab-title badge, mute toggle)
- **Type safety** — OpenAPI codegen (`api.types.ts`) keeps types in lockstep with backend
- **Middleware** — gates all `(app)` routes on presence of the `sentry_access` cookie

---

## Quick start

```bash
# 1. Build sentry-ui-kit first (file: dep)
cd ../sentry-ui-kit
npm install
npm run build

# 2. Start sentry-backend (localhost:8000) — see ../sentry-backend/README.md
# 3. Run frontend
cd ../sentry-frontend
npm install
cp .env.example .env.local       # adjust NEXT_PUBLIC_API_BASE_URL if not localhost:8000
npm run dev                       # → http://localhost:3000
```

---

## Project layout

```
src/
├── app/
│   ├── layout.tsx              — root (loads ui-kit styles)
│   ├── page.tsx                — redirect → /dashboard
│   ├── globals.css             — @import "@chipmo-sentry/ui-kit/styles.css"
│   ├── (auth)/login/page.tsx   — public, Suspense-wrapped form
│   └── (app)/
│       ├── layout.tsx          — <Toaster><AppShell> wrapper
│       ├── dashboard/page.tsx  — 7-day trend + review list
│       ├── live/page.tsx       — HLS tiles + Canvas overlay (from /api/v1/cameras)
│       ├── clips/upload/page.tsx
│       ├── alerts/page.tsx     — filter + search + pagination + feedback
│       ├── alerts/[id]/page.tsx
│       ├── behaviors/page.tsx  — weights/thresholds editor (PATCH)
│       ├── stores/page.tsx     — CRUD
│       ├── cameras/page.tsx    — CRUD
│       └── admin/page.tsx      — orgs + user invite (super-admin only)
├── components/
│   ├── AppShell.tsx            — shell + AlertStreamProvider + NotificationListener
│   ├── Topbar.tsx              — page title, notif bell, user menu
│   ├── Sidebar.tsx             — desktop rail + mobile drawer, role-gated nav
│   ├── Toaster.tsx             — useToast on ui-kit Radix Toast
│   ├── NotificationListener.tsx— browser notif + beep + tab-title badge
│   ├── Field.tsx               — labeled form field
│   └── LiveCameraTile.tsx      — <video> + <canvas> bbox/risk overlay
├── lib/
│   ├── api.ts                  — fetch wrappers, cookies via `credentials: "include"`
│   ├── api.types.ts            — GENERATED from OpenAPI (do not edit by hand)
│   ├── types.ts                — re-exports generated schemas (drift-proof)
│   ├── sse.ts                  — useAlertStream (EventSource)
│   ├── alert-stream-context.tsx— single shared SSE subscription
│   ├── live-ws.ts              — useLiveMetadata (WS /ws/live/{cam})
│   ├── hls.ts                  — attachHls helper
│   ├── time.ts                 — Mongolian relative-time
│   └── notif-prefs.ts          — notification mute pref (localStorage)
├── middleware.ts               — cookie gate, redirect to /login?next=…
openapi/backend.openapi.json    — committed backend spec snapshot
scripts/                        — fetch-openapi.sh, codegen-check.sh
```

---

## Configuration

| Variable | Where it's used |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Browser bundle — `lib/api.ts` `fetch` target |
| `SENTRY_BACKEND_URL` | Reserved for server-side route handlers (unused in M1) |

The `NEXT_PUBLIC_` prefix is required for env vars to reach the browser; secrets must never use it.

---

## Tech

- **Next.js 15** App Router, Turbopack dev
- **React 19**, strict mode
- **TypeScript 5** strict + `noUncheckedIndexedAccess`
- **Tailwind v4** via `@tailwindcss/postcss` + `@theme` tokens from ui-kit
- **lucide-react** icons
- File-deps: `@chipmo-sentry/ui-kit` via `file:../sentry-ui-kit` (until GitHub Packages publish lands)

---

## Build + verify

```bash
npm run typecheck     # tsc --noEmit (strict)
npm run build         # production build (all routes prerendered where possible)
npm run dev           # Turbopack dev server with HMR
npm run codegen       # regen src/lib/api.types.ts from openapi/backend.openapi.json
npm run codegen:check # CI drift guard — fail if api.types.ts is stale
npm run fetch-openapi # pull spec from a running backend, then codegen
```

Latest build: 11 routes (root, login, dashboard, live, clips/upload, alerts, alerts/[id], behaviors, stores, cameras, admin), 13 build outputs, 102 kB shared JS, middleware 34 kB.

### Type contract (OpenAPI codegen)

`src/lib/api.types.ts` is **generated** from the committed `openapi/backend.openapi.json`
snapshot; `lib/types.ts` re-exports those schemas so app code never drifts from the
backend contract. After changing backend Pydantic models: regenerate the snapshot
(`npm run fetch-openapi` against a running backend) and commit both files. CI runs
`codegen:check` and fails PRs where the generated types are out of date.

---

## Deployment — Railway

Target: **Railway Pro**. Frontend ships as a Docker container with Next.js standalone output (small ~100 MB runtime image, no `node_modules` carried at runtime).

### Why the Dockerfile builds from the parent directory

The Dockerfile is monorepo-aware — it expects to see both `sentry-frontend/` and `sentry-ui-kit/` siblings at the build context root so it can build the ui-kit first and then npm-link it into the frontend. This matches our local workspace layout:

```
Sentry-v.3/                  ← Docker build context lives here for the parent build
├── sentry-frontend/
│   └── Dockerfile           ← uses ../sentry-ui-kit
└── sentry-ui-kit/
```

### Railway setup (two options)

**Option A — Per-repo, slim image (recommended once ui-kit is published)**

1. Once `@chipmo-sentry/ui-kit` is published to GitHub Packages (workflow lands in ui-kit Session 2), bump the dep in `package.json` from `file:../sentry-ui-kit` to `^0.1.0`.
2. Railway points at the `sentry-frontend` repo directly. Dockerfile drops the `sentry-ui-kit` copy/build stage.

**Option B — Monorepo build context (today, while ui-kit is unpublished)**

1. Connect a Railway project to **both** repos via a small wrapper repo OR clone both as submodules.
2. In Railway service settings, set **Root Directory** to `sentry-frontend` and **Build Context** to the parent so the Dockerfile can `COPY sentry-ui-kit/`.
3. Set env: `NEXT_PUBLIC_API_BASE_URL=https://api.sentry.chipmo.mn`.
4. Add a public domain → CNAME `app.sentry.chipmo.mn` to it.

### CORS reminder

The backend's `ALLOWED_ORIGINS` env must include `https://app.sentry.chipmo.mn` (or whatever the frontend's public domain is).

### Local Docker smoke test

```bash
# From the parent (Sentry-v.3/) directory
docker build -t sentry-frontend:dev -f sentry-frontend/Dockerfile .
docker run --rm -p 3000:3000 \
  -e NEXT_PUBLIC_API_BASE_URL=http://host.docker.internal:8000 \
  sentry-frontend:dev
curl http://localhost:3000/login
```

---

## Related repos

- [sentry-backend](https://github.com/Chipmo-Sentry/sentry-backend) — REST API (auth, multi-tenant, clips, alerts)
- [sentry-ai](https://github.com/Chipmo-Sentry/sentry-ai) — VLM inference (triggered by backend per clip)
- [sentry-ui-kit](https://github.com/Chipmo-Sentry/sentry-ui-kit) — shared components

Platform overview: [Sentry-v.3 README](../README.md) (local workspace)
