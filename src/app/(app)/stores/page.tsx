"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
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
  AlertTriangle,
  Cctv,
  Check,
  Clock,
  Copy,
  Download,
  Laptop,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Store as StoreIcon,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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

/** Curated timezone choices. Mongolia spans two zones; a few neighbours are
 * included for stores operating cross-border. Free-text entry is error-prone,
 * so the form offers these as a dropdown. */
const TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Ulaanbaatar", label: "Улаанбаатар (GMT+8)" },
  { value: "Asia/Hovd", label: "Ховд / баруун аймгууд (GMT+7)" },
  { value: "Asia/Irkutsk", label: "Эрхүү (GMT+8)" },
  { value: "Asia/Shanghai", label: "Бээжин (GMT+8)" },
  { value: "Asia/Seoul", label: "Сөүл (GMT+9)" },
];

/** Humanise an IANA timezone for display; falls back to the raw id. */
function tzLabel(tz: string): string {
  return TIMEZONES.find((t) => t.value === tz)?.label ?? tz;
}

/** Latest published Sentry agent installer (GitHub Releases). The
 * `latest/download` path always resolves to the newest release's asset, so this
 * never needs bumping per release. Setup.exe lets the user choose the install
 * folder, adds Start Menu / autostart, and runs from the install dir. */
const AGENT_DOWNLOAD_URL =
  "https://github.com/Chipmo-Sentry/sentry-agent-pc/releases/latest/download/ChipmoSentryAgent-Setup.exe";

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
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Дэлгүүр</h1>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          Шинэ дэлгүүр
        </Button>
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
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                    <Clock className="h-3 w-3" />
                    {tzLabel(s.timezone)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Status pills — operational state only, grouped together. */}
                  <div className="flex items-center gap-2">
                    <Badge tone={agentCounts[s.id]?.active ? "success" : "neutral"}>
                      <Laptop className="h-3 w-3" />
                      {agentCounts[s.id]?.total
                        ? `${agentCounts[s.id]!.active}/${agentCounts[s.id]!.total} компьютер`
                        : "Компьютер холбоогүй"}
                    </Badge>
                    <Badge
                      tone={
                        camCounts[s.id]
                          ? "success"
                          : agentCounts[s.id]?.active
                            ? "warning"
                            : "neutral"
                      }
                    >
                      <Cctv className="h-3 w-3" />
                      {camCounts[s.id]
                        ? `${camCounts[s.id]} камер`
                        : agentCounts[s.id]?.active
                          ? "Камер илрээгүй"
                          : "0 камер"}
                    </Badge>
                  </div>
                  {/* Actions, separated from status. */}
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConnectStore(s)}
                    >
                      Компьютер холбох
                    </Button>
                    {/* Edit + destructive delete tucked into an overflow menu so
                        delete can't be hit by accident. */}
                    <Dropdown>
                      <DropdownTrigger asChild>
                        <Button size="sm" variant="ghost" aria-label="Бусад үйлдэл">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownContent align="end">
                        <DropdownItem onClick={() => setEditing(s)}>
                          <Pencil className="h-4 w-4" />
                          Засах
                        </DropdownItem>
                        <DropdownItem
                          className="text-[var(--color-danger)] focus:text-[var(--color-danger)]"
                          onClick={() => setConfirmDelete(s)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Устгах
                        </DropdownItem>
                      </DropdownContent>
                    </Dropdown>
                  </div>
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
  const [telegramChatId, setTelegramChatId] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync form when the target store changes / modal opens.
  useEffect(() => {
    if (!open) return;
    setName(store?.name ?? "");
    setAddress(store?.address ?? "");
    setTimezone(store?.timezone ?? DEFAULT_TZ);
    setTelegramChatId(store?.telegram_chat_id ?? "");
  }, [open, store]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body: StoreInput = {
      name: name.trim(),
      address: address.trim() || null,
      timezone: timezone.trim() || DEFAULT_TZ,
      telegram_chat_id: telegramChatId.trim() || null,
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
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={saving}
              className="flex h-10 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {/* Preserve a stored value that isn't in the curated list. */}
              {!TIMEZONES.some((t) => t.value === timezone) && (
                <option value={timezone}>{timezone}</option>
              )}
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <label
              htmlFor="store-telegram-chat-id"
              className="mb-1 block text-sm font-medium"
            >
              Telegram чат ID
            </label>
            <Input
              id="store-telegram-chat-id"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="Жишээ: -1001234567890"
              disabled={saving}
              inputMode="numeric"
            />
            <span className="mt-1 block text-xs text-[var(--color-muted-foreground)]">
              Сэжигтэй үйлдлийн мэдэгдэл энэ чат руу очно (заавал биш).
            </span>
            <details className="mt-1.5 text-xs">
              <summary className="cursor-pointer font-medium text-[var(--color-primary)] hover:underline">
                Чат ID-гаа хэрхэн олох вэ?
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[var(--color-muted-foreground)]">
                <li>
                  Telegram дээр <b>@getidsbot</b>-г хайж олоод чатаа эхлүүлнэ
                  (мессеж бичих эсвэл <code>/start</code>).
                </li>
                <li>
                  Бот таны хувийн чат ID-г (эерэг тоо) шууд хариулна. Үүнийг
                  доорх талбарт оруулна.
                </li>
                <li>
                  <b>Бүлэг рүү</b> мэдэгдэл авах бол: тухайн бүлэгтээ манай Sentry
                  ботыг болон <b>@getidsbot</b>-г нэмж, гарч ирэх хасах
                  тэмдэгтэй ID-г (жишээ: <code>-1001234567890</code>) хуулна.
                </li>
              </ol>
            </details>
          </div>
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
  // `${kind}:${id}` of the row awaiting delete confirmation (inline).
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [copied, setCopied] = useState(false);

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
                Sentry агент татах (Setup.exe)
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
                        <Badge tone={a.is_active ? "success" : "neutral"}>
                          {a.is_active ? "Идэвхтэй" : "Салгасан"}
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
                        <Badge tone={c.enabled ? "success" : "neutral"}>
                          {c.enabled ? "Идэвхтэй" : "Унтраалттай"}
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
