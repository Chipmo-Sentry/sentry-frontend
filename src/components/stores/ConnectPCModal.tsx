"use client";

import {
  Badge,
  Button,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@chipmo-sentry/ui-kit";
import {
  AlertTriangle,
  Cctv,
  Check,
  Copy,
  Download,
  Laptop,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/Toaster";
import { agents, ApiError, cameras } from "@/lib/api";
import { relativeTime } from "@/lib/time";
import type {
  AgentPublic,
  CameraPublic,
  PairingCodePublic,
  StorePublic,
} from "@/lib/types";

/** Latest published Sentry agent installer (GitHub Releases). The
 * `latest/download` path always resolves to the newest release's asset, so this
 * never needs bumping per release. Setup.exe lets the user choose the install
 * folder, adds Start Menu / autostart, and runs from the install dir. */
const AGENT_DOWNLOAD_URL =
  "https://github.com/Chipmo-Sentry/sentry-agent-pc/releases/latest/download/ChipmoSentryAgent-Setup.exe";

// A computer is ONLINE if its agent reported in within this window. A running
// agent touches the backend ~every 30s, so 120s tolerates a few missed beats.
const AGENT_ONLINE_MS = 120_000;

export function isAgentOnline(a: AgentPublic): boolean {
  if (!a.last_seen_at) return false;
  return Date.now() - new Date(a.last_seen_at).getTime() < AGENT_ONLINE_MS;
}

export interface ConnectPCModalProps {
  store: StorePublic | null;
  onClose: () => void;
}

export function ConnectPCModal({ store, onClose }: ConnectPCModalProps) {
  const { toast } = useToast();
  const [code, setCode] = useState<PairingCodePublic | null>(null);
  const [agentList, setAgentList] = useState<AgentPublic[] | null>(null);
  const [camList, setCamList] = useState<CameraPublic[] | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  // `${kind}:${id}` of the row awaiting delete confirmation (inline).
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Latest published agent version, shown on the download button. The URL is
  // always /releases/latest; the version label just confirms it's current.
  const [agentVersion, setAgentVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/Chipmo-Sentry/sentry-agent-pc/releases/latest")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.tag_name) setAgentVersion(String(d.tag_name));
      })
      .catch(() => {});
  }, []);

  async function copyCode(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Хуулж чадсангүй", tone: "danger" });
    }
  }

  const open = store !== null;
  const storeId = store?.id ?? null;

  const reload = useCallback(() => {
    if (!storeId) return;
    agents
      .listForStore(storeId)
      .then(setAgentList)
      .catch(() => setAgentList([]));
    cameras
      .list(storeId)
      .then(setCamList)
      .catch(() => setCamList([]));
  }, [storeId]);

  // Poll agents + cameras while the modal is open so a freshly-paired PC and
  // the cameras it registers appear live, without reopening.
  useEffect(() => {
    if (!open || !storeId) return;
    setCode(null);
    setAgentList(null);
    setCamList(null);
    setPendingDelete(null);
    let cancelled = false;
    function refresh() {
      agents
        .listForStore(storeId!)
        .then((a) => !cancelled && setAgentList(a))
        .catch(() => !cancelled && setAgentList([]));
      cameras
        .list(storeId!)
        .then((c) => !cancelled && setCamList(c))
        .catch(() => !cancelled && setCamList([]));
    }
    refresh();
    const id = setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, storeId]);

  async function removeAgent(a: AgentPublic) {
    setDeleteBusy(true);
    try {
      await agents.revoke(a.id);
      toast({ title: "Компьютер салгагдлаа", tone: "success" });
      setPendingDelete(null);
      reload();
    } catch (e) {
      toast({
        title: "Салгаж чадсангүй",
        description:
          e instanceof ApiError && e.status === 403
            ? "Танд энэ дэлгүүрт админ эрх алга."
            : e instanceof Error
              ? e.message
              : "Алдаа",
        tone: "danger",
      });
    } finally {
      setDeleteBusy(false);
    }
  }

  async function removeCamera(c: CameraPublic) {
    setDeleteBusy(true);
    try {
      await cameras.remove(c.id);
      toast({ title: "Камер устгагдлаа", tone: "success" });
      setPendingDelete(null);
      reload();
    } catch (e) {
      toast({
        title: "Устгаж чадсангүй",
        description: e instanceof Error ? e.message : "Алдаа",
        tone: "danger",
      });
    } finally {
      setDeleteBusy(false);
    }
  }

  async function generate() {
    if (!store) return;
    setGenBusy(true);
    try {
      setCode(await agents.createPairingCode(store.id));
    } catch (e) {
      toast({
        title: "Код үүсгэж чадсангүй",
        description:
          e instanceof ApiError && e.status === 403
            ? "Танд энэ дэлгүүрт админ эрх алга."
            : e instanceof Error
              ? e.message
              : "Алдаа",
        tone: "danger",
      });
    } finally {
      setGenBusy(false);
    }
  }

  // A camera only streams while a computer is online to relay it. If every
  // computer is offline, its cameras can't be live — so don't show them green.
  const anyComputerOnline = (agentList ?? []).some(isAgentOnline);

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle>Компьютер холбох</ModalTitle>
          <ModalDescription>
            «{store?.name}» дэлгүүрт Sentry агент суулгасан компьютерийг холбоно.
          </ModalDescription>
        </ModalHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">1. Агентыг татаж суулгана</p>
            <Button asChild variant="outline" size="sm">
              <a
                href={AGENT_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="h-4 w-4" />
                Sentry агент татах {agentVersion ? `(${agentVersion})` : "(Setup.exe)"}
              </a>
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">2. Холболтын код үүсгэнэ</p>
            {code ? (
              <>
                <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-muted)] p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <p className="font-mono text-4xl font-bold tracking-[0.3em]">
                      {code.code}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Кодыг хуулах"
                      title="Кодыг хуулах"
                      onClick={() => copyCode(code.code)}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-[var(--color-success)]" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                    Агент дээр энэ кодыг 10 минутын дотор оруулна уу.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generate}
                  disabled={genBusy}
                >
                  <RefreshCw className="h-4 w-4" />
                  Шинэ код
                </Button>
              </>
            ) : (
              <Button onClick={generate} disabled={genBusy}>
                {genBusy ? "Үүсгэж байна…" : "Код үүсгэх"}
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Холбогдсон компьютерүүд</p>
            {agentList === null ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Ачааллаж байна…
              </p>
            ) : agentList.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Одоогоор холбогдсон компьютер алга. Агент дээр кодоо оруулмагц
                энд автоматаар гарч ирнэ.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {agentList.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Laptop className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                      <span className="min-w-0">
                        <span className="block truncate">
                          {a.name || "Нэргүй компьютер"}
                        </span>
                        {a.last_seen_at && (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            сүүлд {relativeTime(a.last_seen_at)}
                          </span>
                        )}
                      </span>
                    </span>
                    {pendingDelete === `agent:${a.id}` ? (
                      <span className="flex shrink-0 items-center gap-1">
                        {a.is_active ? (
                          <span
                            className="flex items-center gap-1 text-xs font-medium text-[var(--color-warning)]"
                            title="Энэ компьютер яг одоо ажиллаж байна. Салгавал камерын дамжуулалт зогсоно."
                          >
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            Ажиллаж байна! Салгах уу?
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            Устгах уу?
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={deleteBusy}
                          onClick={() => removeAgent(a)}
                        >
                          Тийм
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={deleteBusy}
                          onClick={() => setPendingDelete(null)}
                        >
                          Үгүй
                        </Button>
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1">
                        <Badge tone={isAgentOnline(a) ? "success" : "neutral"}>
                          {isAgentOnline(a) ? "🟢 Онлайн" : "⚫ Офлайн"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Компьютер устгах"
                          onClick={() => setPendingDelete(`agent:${a.id}`)}
                        >
                          <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Cameras the agent(s) relay for this store */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Дамжуулж буй камерууд</p>
            {camList === null ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Ачааллаж байна…
              </p>
            ) : camList.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Камер хараахан бүртгэгдээгүй. Агент холбогдоод камераа илрүүлмэгц
                энд гарч ирнэ.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {camList.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Cctv className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                      <span className="truncate">{c.name}</span>
                    </span>
                    {pendingDelete === `camera:${c.id}` ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="text-xs text-[var(--color-muted-foreground)]">
                          Устгах уу?
                        </span>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={deleteBusy}
                          onClick={() => removeCamera(c)}
                        >
                          Тийм
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={deleteBusy}
                          onClick={() => setPendingDelete(null)}
                        >
                          Үгүй
                        </Button>
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1">
                        <Badge
                          tone={
                            c.enabled && anyComputerOnline ? "success" : "neutral"
                          }
                        >
                          {!c.enabled
                            ? "Унтраалттай"
                            : anyComputerOnline
                              ? "🟢 Идэвхтэй"
                              : "⚫ Офлайн"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Камер устгах"
                          onClick={() => setPendingDelete(`camera:${c.id}`)}
                        >
                          <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>
            Хаах
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
