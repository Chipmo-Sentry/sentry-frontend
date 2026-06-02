"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import {
  Cctv,
  Download,
  Laptop,
  Pencil,
  Plus,
  RefreshCw,
  Store as StoreIcon,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Field } from "@/components/Field";
import { useToast } from "@/components/Toaster";
import { agents, ApiError, cameras, stores, type StoreInput } from "@/lib/api";
import { relativeTime } from "@/lib/time";
import type {
  AgentPublic,
  CameraPublic,
  PairingCodePublic,
  StorePublic,
} from "@/lib/types";

const DEFAULT_TZ = "Asia/Ulaanbaatar";

/** Latest published Sentry agent .exe (GitHub Releases). The `latest/download`
 * path always resolves to the newest release's asset, so this never needs
 * bumping per release. */
const AGENT_DOWNLOAD_URL =
  "https://github.com/Chipmo-Sentry/sentry-agent-pc/releases/latest/download/ChipmoSentryAgent.exe";

export default function StoresPage() {
  const { toast } = useToast();
  const [list, setList] = useState<StorePublic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // null = closed; {} = create; {...store} = edit
  const [editing, setEditing] = useState<StorePublic | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StorePublic | null>(null);
  const [connectStore, setConnectStore] = useState<StorePublic | null>(null);
  // store_id → camera count (what each store's agent has relayed)
  const [camCounts, setCamCounts] = useState<Record<string, number>>({});
  // store_id → { active, total } paired agents (connected computers)
  const [agentCounts, setAgentCounts] = useState<
    Record<string, { active: number; total: number }>
  >({});

  async function reload() {
    try {
      const [sts, cams] = await Promise.all([stores.list(), cameras.list()]);
      setList(sts);
      const counts: Record<string, number> = {};
      for (const c of cams) {
        if (c.store_id) counts[c.store_id] = (counts[c.store_id] ?? 0) + 1;
      }
      setCamCounts(counts);
      // Agent counts per store (best-effort, one call each).
      const entries = await Promise.all(
        sts.map((s) =>
          agents
            .listForStore(s.id)
            .then((a) => [s.id, a] as const)
            .catch(() => [s.id, [] as AgentPublic[]] as const),
        ),
      );
      const ac: Record<string, { active: number; total: number }> = {};
      for (const [id, a] of entries) {
        ac[id] = { active: a.filter((x) => x.is_active).length, total: a.length };
      }
      setAgentCounts(ac);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа");
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function onDelete(store: StorePublic) {
    try {
      await stores.remove(store.id);
      toast({ title: "Дэлгүүр устгагдлаа", tone: "success" });
      setConfirmDelete(null);
      reload();
    } catch (e) {
      toast({
        title: "Устгаж чадсангүй",
        description: e instanceof Error ? e.message : "Алдаа",
        tone: "danger",
      });
    }
  }

  if (error) return <p className="p-8 text-[var(--color-danger)]">{error}</p>;
  if (list === null) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Дэлгүүр</h1>
        <div className="flex items-center gap-3">
          <p className="hidden max-w-xs text-right text-xs leading-snug text-[var(--color-muted-foreground)] sm:block">
            Камераа холбохын тулд дэлгүүрийнхээ компьютер дээр Sentry агентыг
            суулгаад, дэлгүүрийн 6 оронтой кодоор холбоно.
          </p>
          <Button asChild variant="outline" title="Windows .exe — давхар товшиж асаана">
            <a href={AGENT_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" />
              Агент татах
            </a>
          </Button>
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Шинэ дэлгүүр
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title="Дэлгүүр бүртгэгдээгүй"
          description="Эхний дэлгүүрээ нэмж эхлүүлнэ үү."
          action={<Button onClick={() => setEditing("new")}>Дэлгүүр нэмэх</Button>}
        />
      ) : (
        <div className="space-y-3">
          {list.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="font-medium">{s.name}</p>
                  <p className="truncate text-sm text-[var(--color-muted-foreground)]">
                    {s.address || "Хаяг оруулаагүй"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      agentCounts[s.id]?.active ? "success" : "neutral"
                    }
                  >
                    <Laptop className="h-3 w-3" />
                    {agentCounts[s.id]?.total
                      ? `${agentCounts[s.id]!.active}/${agentCounts[s.id]!.total} компьютер`
                      : "Компьютер холбоогүй"}
                  </Badge>
                  <Badge tone={camCounts[s.id] ? "success" : "neutral"}>
                    <Cctv className="h-3 w-3" />
                    {camCounts[s.id] ?? 0} камер
                  </Badge>
                  <Badge tone="neutral">{s.timezone}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConnectStore(s)}
                  >
                    <Laptop className="h-4 w-4" />
                    Компьютер холбох
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Засах"
                    onClick={() => setEditing(s)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Устгах"
                    onClick={() => setConfirmDelete(s)}
                  >
                    <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      <StoreFormModal
        open={editing !== null}
        store={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />

      <ConnectPCModal
        store={connectStore}
        onClose={() => setConnectStore(null)}
      />

      {/* Delete confirmation */}
      <Modal
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <ModalContent className="max-w-md">
          <ModalHeader>
            <ModalTitle>Дэлгүүр устгах уу?</ModalTitle>
            <ModalDescription>
              «{confirmDelete?.name}» устгах гэж байна. Үүнийг буцаах боломжгүй.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Болих
            </Button>
            <Button
              variant="danger"
              onClick={() => confirmDelete && onDelete(confirmDelete)}
            >
              Устгах
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function StoreFormModal({
  open,
  store,
  onClose,
  onSaved,
}: {
  open: boolean;
  store: StorePublic | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TZ);
  const [saving, setSaving] = useState(false);

  // Sync form when the target store changes / modal opens.
  useEffect(() => {
    if (!open) return;
    setName(store?.name ?? "");
    setAddress(store?.address ?? "");
    setTimezone(store?.timezone ?? DEFAULT_TZ);
  }, [open, store]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: StoreInput = {
      name: name.trim(),
      address: address.trim() || null,
      timezone: timezone.trim() || DEFAULT_TZ,
    };
    try {
      if (store) {
        await stores.update(store.id, body);
        toast({ title: "Дэлгүүр шинэчлэгдлээ", tone: "success" });
      } else {
        await stores.create(body);
        toast({ title: "Дэлгүүр нэмэгдлээ", tone: "success" });
      }
      onSaved();
    } catch (e) {
      toast({
        title: "Хадгалж чадсангүй",
        description: e instanceof Error ? e.message : "Алдаа",
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>{store ? "Дэлгүүр засах" : "Шинэ дэлгүүр"}</ModalTitle>
        </ModalHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Нэр" required>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Жишээ: Төв салбар"
              disabled={saving}
            />
          </Field>
          <Field label="Хаяг">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="СБД, 1-р хороо…"
              disabled={saving}
            />
          </Field>
          <Field label="Цагийн бүс">
            <Input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={saving}
            />
          </Field>
          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={saving}
            >
              Болих
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Хадгалж байна…" : "Хадгалах"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

function ConnectPCModal({
  store,
  onClose,
}: {
  store: StorePublic | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [code, setCode] = useState<PairingCodePublic | null>(null);
  const [agentList, setAgentList] = useState<AgentPublic[] | null>(null);
  const [camList, setCamList] = useState<CameraPublic[] | null>(null);
  const [genBusy, setGenBusy] = useState(false);

  const open = store !== null;

  // Poll agents + cameras while the modal is open so a freshly-paired PC and
  // the cameras it registers appear live, without reopening.
  useEffect(() => {
    if (!open || !store) return;
    setCode(null);
    setAgentList(null);
    setCamList(null);
    let cancelled = false;
    const sid = store.id;
    function refresh() {
      agents
        .listForStore(sid)
        .then((a) => !cancelled && setAgentList(a))
        .catch(() => !cancelled && setAgentList([]));
      cameras
        .list(sid)
        .then((c) => !cancelled && setCamList(c))
        .catch(() => !cancelled && setCamList([]));
    }
    refresh();
    const id = setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, store]);

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
                Sentry агент татах (.exe)
              </a>
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">2. Холболтын код үүсгэнэ</p>
            {code ? (
              <>
                <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-muted)] p-4 text-center">
                  <p className="font-mono text-4xl font-bold tracking-[0.3em]">
                    {code.code}
                  </p>
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
                    <Badge tone={a.is_active ? "success" : "neutral"}>
                      {a.is_active ? "Идэвхтэй" : "Салгасан"}
                    </Badge>
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
                    <Badge tone={c.enabled ? "success" : "neutral"}>
                      {c.enabled ? "Идэвхтэй" : "Унтраалттай"}
                    </Badge>
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
