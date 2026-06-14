"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Select,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { Cctv, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/Toaster";
import { cameras, stores, type CameraInput } from "@/lib/api";
import type { CameraPublic, StorePublic } from "@/lib/types";

export default function CamerasPage() {
  const { toast } = useToast();
  const [list, setList] = useState<CameraPublic[] | null>(null);
  const [storeList, setStoreList] = useState<StorePublic[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<CameraPublic | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CameraPublic | null>(null);

  const storeName = useMemo(() => {
    const map = new Map(storeList.map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [storeList]);

  async function reload() {
    try {
      const [cams, sts] = await Promise.all([cameras.list(), stores.list()]);
      setList(cams);
      setStoreList(sts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа");
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function onDelete(cam: CameraPublic) {
    try {
      await cameras.remove(cam.id);
      toast({ title: "Камер устгагдлаа", tone: "success" });
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

  const noStores = storeList.length === 0;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Камер</h1>
        <Button onClick={() => setEditing("new")} disabled={noStores}>
          <Plus className="h-4 w-4" />
          Шинэ камер
        </Button>
      </div>

      {noStores ? (
        <EmptyState
          icon={Cctv}
          title="Эхлээд дэлгүүр нэмнэ үү"
          description="Камер нэмэхийн тулд дор хаяж нэг дэлгүүр бүртгэгдсэн байх ёстой."
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Cctv}
          title="Камер бүртгэгдээгүй"
          description="RTSP холболттой эхний камераа нэмнэ үү."
          action={<Button onClick={() => setEditing("new")}>Камер нэмэх</Button>}
        />
      ) : (
        <div className="space-y-3">
          {list.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{c.name}</p>
                    <Badge tone={c.enabled ? "success" : "neutral"}>
                      {c.enabled ? "Идэвхтэй" : "Унтраалттай"}
                    </Badge>
                  </div>
                  <p className="truncate text-sm text-[var(--color-muted-foreground)]">
                    {storeName(c.store_id)} ·{" "}
                    {c.has_rtsp_url ? "RTSP холбосон" : "RTSP алга"} · risk{" "}
                    {Math.round(c.risk_threshold)}%
                    {c.mediamtx_path ? ` · ${c.mediamtx_path}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Засах"
                    onClick={() => setEditing(c)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Устгах"
                    onClick={() => setConfirmDelete(c)}
                  >
                    <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CameraFormModal
        open={editing !== null}
        camera={editing === "new" ? null : editing}
        stores={storeList}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />

      <Modal
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <ModalContent className="max-w-md">
          <ModalHeader>
            <ModalTitle>Камер устгах уу?</ModalTitle>
            <ModalDescription>
              «{confirmDelete?.name}» устгах гэж байна. MediaMTX зам мөн
              устгагдана. Үүнийг буцаах боломжгүй.
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

function CameraFormModal({
  open,
  camera,
  stores: storeList,
  onClose,
  onSaved,
}: {
  open: boolean;
  camera: CameraPublic | null;
  stores: StorePublic[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [storeId, setStoreId] = useState("");
  const [name, setName] = useState("");
  const [rtsp, setRtsp] = useState("");
  const [threshold, setThreshold] = useState("0.5");
  const [risk, setRisk] = useState("50");
  const [mediamtxPath, setMediamtxPath] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStoreId(camera?.store_id ?? storeList[0]?.id ?? "");
    setName(camera?.name ?? "");
    setRtsp(""); // never prefilled — write-only
    setThreshold(String(camera?.stage2_threshold ?? 0.5));
    setRisk(String(camera?.risk_threshold ?? 50));
    setMediamtxPath(camera?.mediamtx_path ?? "");
    setEnabled(camera?.enabled ?? true);
  }, [open, camera, storeList]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // Allow a legitimate 0 (always-alert); only fall back to 50 when blank/NaN.
    const riskNum =
      risk.trim() === "" || Number.isNaN(Number(risk)) ? 50 : Number(risk);
    try {
      if (camera) {
        // PATCH — backend treats null/omitted as "no change", so only send
        // rtsp_url when the operator typed a new one.
        const body: Partial<Omit<CameraInput, "store_id">> = {
          name: name.trim(),
          stage2_threshold: Number(threshold) || 0.5,
          risk_threshold: riskNum,
          enabled,
          mediamtx_path: mediamtxPath.trim() || undefined,
        };
        if (rtsp.trim()) body.rtsp_url = rtsp.trim();
        await cameras.update(camera.id, body);
        toast({ title: "Камер шинэчлэгдлээ", tone: "success" });
      } else {
        const body: CameraInput = {
          store_id: storeId,
          name: name.trim(),
          rtsp_url: rtsp.trim() || null,
          stage2_threshold: Number(threshold) || 0.5,
          risk_threshold: riskNum,
          enabled,
          mediamtx_path: mediamtxPath.trim() || undefined,
        };
        await cameras.create(body);
        toast({ title: "Камер нэмэгдлээ", tone: "success" });
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
      <ModalContent className="max-h-[90vh] overflow-y-auto">
        <ModalHeader>
          <ModalTitle>{camera ? "Камер засах" : "Шинэ камер"}</ModalTitle>
        </ModalHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Дэлгүүр" required>
            <Select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              required
              disabled={saving || camera !== null}
            >
              {storeList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Нэр" required>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Жишээ: Касс 1"
              disabled={saving}
            />
          </Field>
          <Field
            label="RTSP URL"
            hint={
              camera
                ? "Хоосон орхивол одоогийн холболт хэвээр үлдэнэ."
                : "rtsp://хэрэглэгч:нууц@ip:554/stream"
            }
          >
            <Input
              type="password"
              value={rtsp}
              onChange={(e) => setRtsp(e.target.value)}
              placeholder={camera?.has_rtsp_url ? "•••••• (хадгалсан)" : "rtsp://…"}
              disabled={saving}
              autoComplete="off"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage-2 босго (0–1)" hint="VLM шалгах магадлал">
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                disabled={saving}
              />
            </Field>
            <Field
              label="Сэрэмжлүүлэх босго (%)"
              hint="Эрсдэл энэ хувийг давбал клип таслаж, AI шалгаад сэрэмжлүүлэг өгнө. Бага = илүү мэдрэг (50 санал болгоно)."
            >
              <Input
                type="number"
                step="5"
                min="0"
                max="100"
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
                disabled={saving}
              />
            </Field>
          </div>
          <Field
            label="MediaMTX зам"
            hint="Хоосон бол нэрнээс автоматаар үүснэ."
          >
            <Input
              value={mediamtxPath}
              onChange={(e) => setMediamtxPath(e.target.value)}
              placeholder="cam1_hik"
              disabled={saving}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={saving}
              className="h-4 w-4"
            />
            Идэвхтэй (live worker энэ камераас уншина)
          </label>
          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={saving}
            >
              Болих
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim() || !storeId}
            >
              {saving ? "Хадгалж байна…" : "Хадгалах"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
