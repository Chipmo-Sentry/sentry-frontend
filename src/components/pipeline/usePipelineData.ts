"use client";

import { useCallback, useEffect, useState } from "react";

import {
  cameras as camerasApi,
  ingest as ingestApi,
  nodes as nodesApi,
  type AgentPushPath,
  type IngestPathsResponse,
  type OrgNodePublic,
} from "@/lib/api";
import { useAlertStreamContext } from "@/lib/alert-stream-context";
import type { CameraSig, LiveCamera } from "@/lib/pipeline";
import type { CameraPublic } from "@/lib/types";

const POLL_MS = 8000;

/**
 * Shared live data for the Pipeline Canvas + per-stage detail pages: the camera
 * roster, polled node-health and cloud-ingest state, an aging clock, and the
 * per-camera WS signal aggregate. The consumer must render one <CameraSignal>
 * per `cams` entry with `onReport` so the WS probes feed `signals`.
 */
export function usePipelineData() {
  const [cams, setCams] = useState<LiveCamera[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nodeList, setNodeList] = useState<OrgNodePublic[]>([]);
  const [ingest, setIngest] = useState<IngestPathsResponse | null>(null);
  const [push, setPush] = useState<Record<string, AgentPushPath>>({});
  const [signals, setSignals] = useState<Record<string, CameraSig>>({});
  const [now, setNow] = useState(() => Date.now());
  const { alerts, connected: sseConnected } = useAlertStreamContext();

  const reload = useCallback(() => {
    setError(null);
    setCams(null);
    let cancelled = false;
    camerasApi.list().then(
      (list: CameraPublic[]) => {
        if (cancelled) return;
        setCams(
          list
            .filter((c) => c.enabled && c.mediamtx_path)
            .map((c) => ({ id: c.id, path: c.mediamtx_path as string, name: c.name })),
        );
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Алдаа");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => reload(), [reload]);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = () => {
      nodesApi.list().then(
        (list) => {
          if (!cancelled) setNodeList(list);
        },
        () => {},
      );
      ingestApi.paths().then(
        (res) => {
          if (!cancelled) setIngest(res);
        },
        () => {
          if (!cancelled) setIngest(null);
        },
      );
      nodesApi.agentPush().then(
        (res) => {
          if (cancelled) return;
          const byPath: Record<string, AgentPushPath> = {};
          for (const p of res.paths) byPath[p.path] = p;
          setPush(byPath);
        },
        () => {
          if (!cancelled) setPush({});
        },
      );
    };
    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);

  const onReport = useCallback((path: string, sig: CameraSig) => {
    setSignals((prev) => ({ ...prev, [path]: sig }));
  }, []);

  return {
    cams,
    error,
    reload,
    nodeList,
    ingest,
    push,
    signals,
    onReport,
    alerts,
    sseConnected,
    now,
  };
}
