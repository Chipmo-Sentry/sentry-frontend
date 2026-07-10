# sentry-frontend

The customer-facing dashboard for **Chipmo Sentry** — where a store owner watches their cameras live,
sees AI risk overlays in real time, triages alerts, and manages stores, cameras, and team.

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · [sentry-ui-kit](https://github.com/Chipmo-Sentry/sentry-ui-kit) · Apache-2.0

---

## What ships here

- **Live monitoring** — a grid of camera tiles, each playing video over **WebRTC/WHEP** (sub-second,
  primary) with an **HLS** fallback, and a transparent `<canvas>` drawing per-person bounding boxes with
  **🟢🟡🔴 risk %** from a live WebSocket metadata stream.
- **Alerts** — real-time list driven by a single app-wide **SSE** subscription, with level filter, text
  search, pagination, a clip player on the detail page, and TP/FP/unclear feedback.
- **Notifications** — a global listener that fires a browser notification + a Web-Audio beep + a tab-title
  badge on each new alert, with a mute toggle (still shows an in-app toast when muted).
- **Management CRUD** — full create/read/update/delete for **stores** and **cameras**; a **Connect-PC**
  flow that generates a 6-digit pairing code and live-polls until the agent + its cameras appear.
- **Team** — list members, invite by email (with expiry), and **lock/unlock** a member's access (a
  "Түгжээтэй" badge marks locked members). Owner/admin only.
- **Behaviours** — read-only view of the risk-scoring dimensions + thresholds (editing lives in the
  super-admin panel).
- **Admin** — super-admin-only org + user management, surfaced in the role-gated sidebar.

---

## Routes

```
/                        → redirects to /dashboard
/login                   email + password
/accept-invite           set a password + join an org from an invite link
/dashboard               alert counts by level + 7-day trend + recent review
/live                    camera grid (WHEP/HLS + canvas overlay)
/live/[cameraId]         single-camera detailed view
/health                  node/camera health
/health/node/[nodeId]    single-node health detail
/pipeline                stage matrix + per-camera pipeline
/pipeline/stage/[stage]  per-stage detail
/pipeline/camera/[path]  per-camera pipeline trace
/clips/upload            drag-drop mp4 upload
/alerts                  SSE-driven list + filter + search + pagination
/alerts/[id]             clip player + TP/FP/unclear feedback
/behaviors               risk dimensions + thresholds (read-only)
/stores                  store CRUD
/stores/[id]/insights    per-store insights
/cameras                 camera CRUD
/team                    members, invites, lock/unlock (owner/admin)
/logs                    activity / audit event log
/billing                 billing
/admin                   org + user management (super-admin)
```

---

## Architecture notes

- **Same-origin auth.** The browser never calls the backend cross-site. `next.config.mjs` rewrites
  `/api/*` and `/ws/*` to `BACKEND_ORIGIN` server-side, so the httpOnly `sentry_access` cookie is
  same-origin and `SameSite=Lax` just works — **no custom DNS or CORS dance needed** ([ADR-0017](../docs/07-DECISIONS.md)).
  `src/middleware.ts` gates app routes on the cookie's presence.
- **Type-safe API.** `src/lib/api.types.ts` is generated from `openapi/backend.openapi.json` by
  `openapi-typescript`; `src/lib/types.ts` re-exports friendly aliases. CI runs `codegen:check` and fails
  on any drift from the backend contract.
- **Live transport.** `src/lib/live-video.ts` tries WHEP first and falls back to HLS (`hls.js` low-latency
  + Safari native), reconnecting with exponential backoff. `whep.ts` / `hls.ts` are the transports;
  `live-ws.ts` carries the overlay metadata.
- **Real-time.** `AlertStreamProvider` holds one shared `EventSource` to `/api/v1/alerts/stream` (capped
  at 200 newest alerts); `NotificationListener` consumes it for notifications.

```
src/
├── app/                 — App Router routes (see above)
├── components/          — AppShell, Topbar, Sidebar, Toaster, NotificationListener, LiveCameraTile, NotificationBell
├── lib/                 — api, api.types (generated), types, sse, alert-stream-context,
│                          live-ws, whep, hls, live-video, time, notif-prefs
└── middleware.ts        — cookie gate
openapi/backend.openapi.json   — contract snapshot
scripts/                 — fetch-openapi.sh, codegen-check.sh
```

---

## Quick start

```bash
# 1. Build the ui-kit (a file: dependency)
( cd ../sentry-ui-kit && npm install && npm run build )

# 2. Start the backend on :8000 (see sentry-backend/README)

# 3. Run the frontend
npm install
cp .env.example .env.local      # set BACKEND_ORIGIN=http://localhost:8000
npm run dev                     # → http://localhost:3000
```

Scripts: `dev` · `build` (standalone) · `start` · `lint` · `typecheck` · `fetch-openapi` (pull spec from a
running backend + regenerate types) · `codegen` · `codegen:check` (CI drift guard).

### Configuration

| Var | Scope | Purpose |
|---|---|---|
| `BACKEND_ORIGIN` | server | proxy target for `/api/*` + `/ws/*` (e.g. `http://localhost:8000`, `https://api.sentry.chipmo.mn`) |
| `NEXT_PUBLIC_API_BASE_URL` | browser | leave **empty** for same-origin — setting it in prod breaks cookie auth |
| `SENTRY_BACKEND_URL` | server | reserved for future server-only route handlers |

---

## Deployment

Target: **Railway** (Dockerfile + `railway.toml`), live at `sentry-frontend-production.up.railway.app`.

The Dockerfile is a 3-stage monorepo build: it clones + builds `sentry-ui-kit` (pinned to a tag),
produces a Next.js **standalone** bundle, and ships a minimal Node-Alpine runtime image (~100 MB). The
healthcheck hits `/login` (200, no auth). `ci.yml` runs codegen-drift + typecheck + build;
`railway-deploy.yml` redeploys on push to `main`. Set `BACKEND_ORIGIN` in the Railway dashboard; do **not**
set `NEXT_PUBLIC_API_BASE_URL`.

Once `@chipmo-sentry/ui-kit` is published to GitHub Packages, the `file:../sentry-ui-kit` dependency can be
swapped for a versioned range and the Dockerfile slimmed.

---

## Related repos

- [sentry-backend](https://github.com/Chipmo-Sentry/sentry-backend) — REST + SSE + WebSocket contract
- [sentry-ui-kit](https://github.com/Chipmo-Sentry/sentry-ui-kit) — shared components + tokens
- [sentry-superadmin](https://github.com/Chipmo-Sentry/sentry-superadmin) — the platform-admin sibling

Platform overview: [Sentry-v.3 README](../README.md).
