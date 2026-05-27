# sentry-frontend

Customer dashboard for **Chipmo Sentry** — Next.js 15 App Router + React 19 + [sentry-ui-kit](https://github.com/Chipmo-Sentry/sentry-ui-kit). Talks to [sentry-backend](https://github.com/Chipmo-Sentry/sentry-backend) over cookie-authenticated REST.

Apache 2.0

---

## What ships in M1 (Session 1)

- **Login** (`/login`) — email + password → httpOnly cookie from backend
- **Dashboard** (`/dashboard`) — recent alert counts by level
- **Clip upload** (`/clips/upload`) — drag-drop mp4, store selector, posts to `/api/v1/clips`
- **Alerts** (`/alerts`) — list with category/confidence/reasoning, TP/FP buttons, polling every 10s
- **Middleware** — gates `/dashboard`, `/clips/*`, `/alerts/*` on presence of `sentry_access` cookie

Out of scope until Session 2: SSE real-time alert stream, alert detail page with clip player, super-admin views, sentry-landing entry.

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
│       ├── layout.tsx          — sidebar shell
│       ├── dashboard/page.tsx
│       ├── clips/upload/page.tsx
│       └── alerts/page.tsx
├── components/
│   └── Sidebar.tsx             — nav + logout
├── lib/
│   ├── api.ts                  — fetch wrappers, cookies via `credentials: "include"`
│   └── types.ts                — Pydantic-mirroring TS shapes (codegen comes Session 2)
└── middleware.ts               — cookie gate, redirect to /login?next=…
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
```

Latest build: 5 routes (root + login + dashboard + clips/upload + alerts), 102 kB shared JS, middleware 34 kB.

---

## Deployment

Target: **Vercel**. Set `NEXT_PUBLIC_API_BASE_URL` to `https://api.sentry.chipmo.mn` in Vercel project settings, point a CNAME `app.sentry.chipmo.mn` → Vercel.

CORS: backend's `ALLOWED_ORIGINS` env must include `https://app.sentry.chipmo.mn`.

---

## Related repos

- [sentry-backend](https://github.com/Chipmo-Sentry/sentry-backend) — REST API (auth, multi-tenant, clips, alerts)
- [sentry-ai](https://github.com/Chipmo-Sentry/sentry-ai) — VLM inference (triggered by backend per clip)
- [sentry-ui-kit](https://github.com/Chipmo-Sentry/sentry-ui-kit) — shared components

Platform overview: [Sentry-v.3 README](../README.md) (local workspace)
