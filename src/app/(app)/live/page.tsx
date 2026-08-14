"use client";

import { Button, EmptyState, ErrorState, Spinner } from "@chipmo-sentry/ui-kit";
import { Cctv, Pin } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LiveAlertRail } from "@/components/LiveAlertRail";
import { LiveRiskFeed } from "@/components/LiveRiskFeed";
import { LiveBehaviorPanel } from "@/components/LiveBehaviorPanel";
import { LiveCameraTile } from "@/components/LiveCameraTile";
import { LiveKpiBar } from "@/components/LiveKpiBar";
import {
  alerts as alertsApi,
  nodes as nodesApi,
  behaviors as behaviorsApi,
  cameras as camerasApi,
} from "@/lib/api";
import { useAlertStreamContext } from "@/lib/alert-stream-context";
import { dayKey } from "@/lib/time";
import type { AlertPublic, CameraPublic, Zone } from "@/lib/types";

/**
 * M1-LIVE — smart monitoring console. Instead of a static grid, the highest-risk
 * camera is auto-promoted to a large spotlight (Tier 1 UX), with a live alert
 * rail (the operator's worklist) and a thumbnail strip where every camera's
 * border is coloured by its current risk. Click a thumbnail or alert to pin.
 *
 * `mediamtx_path` is the live-worker camera_id and drives both the stream URLs
 * and the WS metadata channel. NEXT_PUBLIC_MEDIAMTX_* — env overrides for dev.
 */
const MEDIAMTX_HLS_BASE =
  process.env.NEXT_PUBLIC_MEDIAMTX_HLS_BASE ?? "http://localhost:8888";
const MEDIAMTX_WHEP_BASE =
  process.env.NEXT_PUBLIC_MEDIAMTX_WHEP_BASE ?? "http://localhost:8889";

// Spotlight auto-focus hysteresis: a different camera must beat the current
// spotlight's risk by this margin before we switch, so it doesn't flicker
// between near-equal risks.
const FOCUS_MARGIN = 8;
// ...and it must itself be at least this risky to steal focus — below this we
// keep the current spotlight instead of shuffling on low-risk noise.
const AUTO_FOCUS_MIN = 30;

type LiveCamera = {
  id: string;
  path: string;
  name: string;
  zones?: Zone[] | null;
};

type RiskState = { risk: number; online: boolean };

export default function LivePage() {
  const [cams, setCams] = useState<LiveCamera[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelCam, setPanelCam] = useState<LiveCamera | null>(null);
  const [behaviorLabels, setBehaviorLabels] = useState<Record<string, string>>({});
  const [levelLabels, setLevelLabels] = useState<Record<string, string>>({});

  // Per-camera live risk + online state, reported up by each thumbnail tile.
  const [riskByCam, setRiskByCam] = useState<Record<string, RiskState>>({});
  // Auto-focused camera (highest risk, with hysteresis) and the manual pin.
  const [autoCam, setAutoCam] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  // Directory of ALL cameras (incl. disabled / non-streamable) keyed by DB id →
  // name + streamable path. Lets the alert rail name an alert even when its
  // camera isn't in the live grid (path null → card names it but can't pin).
  const [camDir, setCamDir] = useState<
    Record<string, { name: string; path: string | null }>
  >({});

  // Live alert feed: SSE stream (AppShell-mounted) + an initial history seed.
  const { alerts: streamed, connected: alertConnected } = useAlertStreamContext();
  const [seedAlerts, setSeedAlerts] = useState<AlertPublic[]>([]);

  useEffect(() => {
    let cancelled = false;
    behaviorsApi.get().then(
      (cfg) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const d of cfg.dimensions) map[d.key] = d.label_mn;
        setBehaviorLabels(map);
        setLevelLabels(cfg.level_labels ?? {});
      },
      () => {
        /* keys shown raw */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    alertsApi.list({ limit: 40 }).then(
      (list) => {
        if (!cancelled) setSeedAlerts(list);
      },
      () => {
        /* rail just shows live stream */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Real AI health: an ONLINE org node must exist (heartbeat within the server's
  // online window). The old `online > 0` proxy showed "AI: Эрүүл" from mere
  // video flow even when no node was analysing anything. Polled at the same
  // 30s cadence the nodes heartbeat with; null = not yet known → optimistic.
  const [aiHealthy, setAiHealthy] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      nodesApi.list().then(
        (list) => {
          if (!cancelled) setAiHealthy(list.some((n) => n.is_online));
        },
        () => {
          /* keep last known state on a fetch error */
        },
      );
    poll();
    const t = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const load = useCallback(() => {
    setError(null);
    setCams(null);
    let cancelled = false;
    camerasApi.list().then(
      (list: CameraPublic[]) => {
        if (cancelled) return;
        const streamable = list
          .filter((c) => c.enabled && c.mediamtx_path)
          .map((c) => ({
            id: c.id,
            path: c.mediamtx_path as string,
            name: c.name,
            zones: c.zones,
          }));
        setCams(streamable);
        const dir: Record<string, { name: string; path: string | null }> = {};
        for (const c of list) {
          dir[c.id] = {
            name: c.name,
            path: c.enabled && c.mediamtx_path ? c.mediamtx_path : null,
          };
        }
        setCamDir(dir);
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Алдаа");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  // Prune per-camera state when a camera leaves the list (disabled/deleted), so a
  // removed camera can't keep the pin stuck on a ghost, hold the spotlight via a
  // dead autoCam path, or stay counted as "online" in the KPI (riskByCam only
  // ever grows otherwise — handleRisk never deletes).
  useEffect(() => {
    if (cams === null) return;
    const paths = new Set(cams.map((c) => c.path));
    setRiskByCam((prev) => {
      let changed = false;
      const next: Record<string, RiskState> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (paths.has(k)) next[k] = v;
        else changed = true;
      }
      return changed ? next : prev;
    });
    setPinned((p) => (p && !paths.has(p) ? null : p));
    setAutoCam((a) => (a && !paths.has(a) ? null : a));
  }, [cams]);

  // Stable per-camera risk-report callback so the tile's report effect doesn't
  // refire (and loop) every render. `handleRisk` bails when nothing changed.
  const handleRisk = useCallback(
    (path: string, risk: number, online: boolean) => {
      setRiskByCam((prev) => {
        const cur = prev[path];
        if (cur && cur.risk === risk && cur.online === online) return prev;
        return { ...prev, [path]: { risk, online } };
      });
    },
    [],
  );
  const riskCbRef = useRef<Record<string, (r: number, o: boolean) => void>>({});
  const riskCb = useCallback(
    (path: string) => {
      if (!riskCbRef.current[path]) {
        riskCbRef.current[path] = (r, o) => handleRisk(path, r, o);
      }
      return riskCbRef.current[path];
    },
    [handleRisk],
  );

  // Auto-focus: track the highest-risk online camera, with hysteresis.
  useEffect(() => {
    let best: string | null = null;
    let bestRisk = -1;
    for (const [path, s] of Object.entries(riskByCam)) {
      if (!s.online) continue;
      if (s.risk > bestRisk) {
        bestRisk = s.risk;
        best = path;
      }
    }
    if (best == null) return;
    setAutoCam((prev) => {
      if (prev == null || !riskByCam[prev]?.online) return best;
      const prevRisk = riskByCam[prev]?.risk ?? -1;
      // Steal focus only toward a genuinely elevated camera that also beats the
      // current spotlight by the margin.
      if (
        best !== prev &&
        bestRisk >= AUTO_FOCUS_MIN &&
        bestRisk >= prevRisk + FOCUS_MARGIN
      ) {
        return best;
      }
      return prev;
    });
  }, [riskByCam]);

  const recentAlerts = useMemo(() => {
    const map = new Map<string, AlertPublic>();
    for (const a of [...streamed, ...seedAlerts]) map.set(a.id, a);
    return [...map.values()]
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 40);
  }, [streamed, seedAlerts]);

  const online = useMemo(
    () => Object.values(riskByCam).filter((s) => s.online).length,
    [riskByCam],
  );
  const todayKey = dayKey(new Date().toISOString());
  const todayAlerts = recentAlerts.filter(
    (a) => dayKey(a.created_at) === todayKey,
  ).length;
  const avgLatencyMs = recentAlerts.length
    ? recentAlerts.reduce((s, a) => s + (a.inference_latency_ms ?? 0), 0) /
      recentAlerts.length
    : null;

  const hlsUrl = (path: string) => `${MEDIAMTX_HLS_BASE}/${path}/index.m3u8`;
  const whepUrl = (path: string) => `${MEDIAMTX_WHEP_BASE}/${path}/whep`;

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (cams === null) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }
  if (cams.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          icon={Cctv}
          title="Идэвхтэй камер алга"
          description="Шууд харахын тулд идэвхтэй, MediaMTX замтай камер бүртгэнэ үү."
          action={
            <Link href="/cameras">
              <Button>Камер удирдах</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const first = cams[0]!; // cams is non-empty here (the length===0 case returned)
  const spotlightPath = pinned ?? autoCam ?? first.path;
  const spotlight = cams.find((c) => c.path === spotlightPath) ?? first;
  // Strip shows every OTHER camera (the spotlight plays large above).
  const stripCams = cams.filter((c) => c.path !== spotlight.path);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Control bar — camera count + pin state. */}
      <header className="flex items-center justify-between gap-4 border-b border-(--color-border) bg-(--color-background) px-4 py-2">
        <p className="text-xs text-(--color-muted-foreground)">
          {cams.length} камер · эрсдэлээр автоматаар томруулна
        </p>
        {pinned ? (
          <button
            type="button"
            onClick={() => setPinned(null)}
            className="flex items-center gap-1.5 rounded-md bg-(--color-primary)/15 px-2 py-1 text-xs font-medium text-blue-300 transition hover:bg-(--color-primary)/25"
          >
            <Pin className="h-3 w-3" aria-hidden />
            Тогтоосон: {spotlight.name} · Авто болгох
          </button>
        ) : (
          <p className="text-xs text-(--color-muted-foreground)">
            Камер дээр дарж тогтооно
          </p>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-auto bg-(--color-muted) p-3">
        <LiveKpiBar
          online={online}
          total={cams.length}
          todayAlerts={todayAlerts}
          avgLatencyMs={avgLatencyMs}
          aiHealthy={aiHealthy ?? online > 0}
        />

        {/* Spotlight (auto-focused or pinned) + live alert rail. */}
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0">
            <div className="aspect-video w-full">
              <LiveCameraTile
                key="spotlight"
                cameraId={spotlight.path}
                streamCameraId={spotlight.id}
                name={spotlight.name}
                whepUrl={whepUrl(spotlight.path)}
                hlsUrl={hlsUrl(spotlight.path)}
                detailHref={`/live/${encodeURIComponent(spotlight.path)}`}
                onShowPanel={() => setPanelCam(spotlight)}
                onRisk={riskCb(spotlight.path)}
                zones={spotlight.zones}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3 lg:h-full">
            <div className="max-h-[45%] min-h-[120px]">
              <LiveRiskFeed cams={cams.map((c) => ({ path: c.path, name: c.name }))} />
            </div>
            <LiveAlertRail
              alerts={recentAlerts}
              connected={alertConnected}
              camById={camDir}
              behaviorLabels={behaviorLabels}
              onSelectCamera={(path) => setPinned(path)}
            />
          </div>
        </div>

        {/* Thumbnail strip — every camera EXCEPT the spotlighted one (which plays
         * large above; excluding it avoids a second stream of the same camera and
         * the redundant thumbnail on a single-camera store). Ambient risk border,
         * click to pin. Hidden when there's nothing left to show. */}
        {stripCams.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {stripCams.map((c) => (
              <LiveCameraTile
                key={`thumb-${c.path}`}
                compact
                onSelect={() => setPinned(c.path)}
                onRisk={riskCb(c.path)}
                cameraId={c.path}
                streamCameraId={c.id}
                name={c.name}
                whepUrl={whepUrl(c.path)}
                hlsUrl={hlsUrl(c.path)}
                zones={c.zones}
              />
            ))}
          </div>
        )}
      </div>

      {panelCam && (
        <LiveBehaviorPanel
          key={panelCam.path}
          cameraId={panelCam.path}
          name={panelCam.name}
          labels={behaviorLabels}
          levelLabels={levelLabels}
          onClose={() => setPanelCam(null)}
        />
      )}
    </div>
  );
}
