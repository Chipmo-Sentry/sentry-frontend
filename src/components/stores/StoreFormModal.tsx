"use client";

import {
  Button,
  Field,
  Input,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Select,
} from "@chipmo-sentry/ui-kit";
import { useEffect, useState } from "react";

import { useToast } from "@/components/Toaster";
import { stores, type StoreInput } from "@/lib/api";
import type { StorePublic } from "@/lib/types";

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
export function tzLabel(tz: string): string {
  return TIMEZONES.find((t) => t.value === tz)?.label ?? tz;
}

export interface StoreFormModalProps {
  open: boolean;
  store: StorePublic | null;
  onClose: () => void;
  onSaved: () => void;
}

export function StoreFormModal({
  open,
  store,
  onClose,
  onSaved,
}: StoreFormModalProps) {
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
            <Select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={saving}
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
            </Select>
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
