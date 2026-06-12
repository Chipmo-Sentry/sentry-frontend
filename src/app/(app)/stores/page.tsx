"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
  EmptyState,
  ErrorState,
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
  Clock,
  Laptop,
  MoreVertical,
  Pencil,
  Plus,
  Store as StoreIcon,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  ConnectPCModal,
  isAgentOnline,
} from "@/components/stores/ConnectPCModal";
import {
  StoreFormModal,
  tzLabel,
} from "@/components/stores/StoreFormModal";
import { useToast } from "@/components/Toaster";
import { agents, cameras, stores } from "@/lib/api";
import type { AgentPublic, StorePublic } from "@/lib/types";

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
        // "active" = computers actually ONLINE now (reported in within the
        // window), NOT merely paired — so an uninstalled / powered-off PC
        // shows as offline instead of a stale green "connected".
        ac[id] = { active: a.filter(isAgentOnline).length, total: a.length };
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

  if (error) {
    return (
      <div className="p-8">
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            reload();
          }}
        />
      </div>
    );
  }
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
                  {/* All row actions live in one overflow menu — connect,
                      edit, and (separated) the destructive delete. */}
                  <Dropdown>
                    <DropdownTrigger asChild>
                      <Button size="sm" variant="ghost" aria-label="Үйлдлүүд">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownContent align="end">
                      <DropdownItem onClick={() => setConnectStore(s)}>
                        <Laptop className="h-4 w-4" />
                        Компьютер холбох
                      </DropdownItem>
                      <DropdownItem onClick={() => setEditing(s)}>
                        <Pencil className="h-4 w-4" />
                        Засах
                      </DropdownItem>
                      <DropdownSeparator />
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
