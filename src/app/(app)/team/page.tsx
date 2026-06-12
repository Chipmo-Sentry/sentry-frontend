"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { Lock, Trash2, Unlock, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { useToast } from "@/components/Toaster";
import { auth, org, ApiError, type OrgMember, type PendingInvite } from "@/lib/api";
import type { OrgRole } from "@/lib/types";

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Эзэмшигч",
  admin: "Админ",
  staff: "Ажилтан",
};
// An org admin may invite admin or staff (owner is set when the org is created).
const INVITE_ROLES: { value: OrgRole; label: string }[] = [
  { value: "staff", label: "Ажилтан (зөвхөн харах)" },
  { value: "admin", label: "Админ (удирдах эрхтэй)" },
];

export default function TeamPage() {
  const { toast } = useToast();
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Replaces native confirm() — a styled confirmation modal. `onConfirm` runs
  // the destructive action; the modal closes itself afterwards.
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  async function reload() {
    try {
      const [mem, me] = await Promise.all([org.members(), auth.me()]);
      setMembers(mem);
      setMeId(me.id);
      // Pending invites — admin-only endpoint; plain members get 403 → ignore.
      try {
        setInvites(await org.invitations());
      } catch {
        setInvites([]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Алдаа");
    }
  }

  useEffect(() => {
    reload();
  }, []);

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
  if (members === null) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  const myRole = members.find((m) => m.user.id === meId)?.role;
  const canManage = myRole === "owner" || myRole === "admin";

  async function doRemove(m: OrgMember) {
    try {
      await org.removeMember(m.user.id);
      toast({ title: "Хэрэглэгч хасагдлаа", tone: "success" });
      reload();
    } catch (e) {
      toast({
        title: "Хасч чадсангүй",
        description: e instanceof ApiError ? e.message : "Алдаа",
        tone: "danger",
      });
    }
  }

  function onRemove(m: OrgMember) {
    setConfirmState({
      title: "Хэрэглэгч хасах",
      message: `${m.user.email}-г байгууллагаас хасах уу?`,
      confirmLabel: "Хасах",
      danger: true,
      onConfirm: () => doRemove(m),
    });
  }

  async function doToggleActive(m: OrgMember) {
    const lock = m.user.is_active; // currently active → we are locking
    try {
      await org.setMemberActive(m.user.id, !m.user.is_active);
      toast({ title: lock ? "Хэрэглэгч түгжигдлээ" : "Хэрэглэгч нээгдлээ", tone: "success" });
      reload();
    } catch (e) {
      toast({
        title: "Болсонгүй",
        description: e instanceof ApiError ? e.message : "Алдаа",
        tone: "danger",
      });
    }
  }

  function onToggleActive(m: OrgMember) {
    const lock = m.user.is_active;
    const verb = lock ? "түгжих" : "нээх";
    setConfirmState({
      title: lock ? "Нэвтрэх эрх түгжих" : "Нэвтрэх эрх нээх",
      message: `${m.user.email}-ийн нэвтрэх эрхийг ${verb} үү?`,
      confirmLabel: lock ? "Түгжих" : "Нээх",
      danger: lock,
      onConfirm: () => doToggleActive(m),
    });
  }

  async function doCancelInvite(inv: PendingInvite) {
    try {
      await org.cancelInvite(inv.id);
      toast({ title: "Урилга цуцлагдлаа", tone: "success" });
      reload();
    } catch (e) {
      toast({
        title: "Цуцалж чадсангүй",
        description: e instanceof ApiError ? e.message : "Алдаа",
        tone: "danger",
      });
    }
  }

  function onCancelInvite(inv: PendingInvite) {
    setConfirmState({
      title: "Урилга цуцлах",
      message: `${inv.email}-д илгээсэн урилгыг цуцлах уу?`,
      confirmLabel: "Цуцлах",
      danger: true,
      onConfirm: () => doCancelInvite(inv),
    });
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Хэрэглэгчид</h1>
        {canManage && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Урих
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Багийн гишүүд</CardTitle>
          <CardDescription>Нийт {members.length}</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <EmptyState icon={Users} title="Гишүүн алга" description="Хэрэглэгч урина уу." />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {members.map((m) => (
                <li key={m.user.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.user.email}</p>
                    {m.user.id === meId && (
                      <span className="text-xs text-[var(--color-muted-foreground)]">та</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!m.user.is_active && <Badge tone="danger">Түгжээтэй</Badge>}
                    <Badge tone={m.role === "owner" ? "warning" : "neutral"}>
                      {ROLE_LABEL[m.role]}
                    </Badge>
                    {canManage && m.role !== "owner" && m.user.id !== meId && (
                      <>
                        <button
                          onClick={() => onToggleActive(m)}
                          aria-label={m.user.is_active ? "Түгжих" : "Нээх"}
                          title={
                            m.user.is_active
                              ? "Нэвтрэх эрхийг түгжих"
                              : "Нэвтрэх эрхийг нээх"
                          }
                          className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                        >
                          {m.user.is_active ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Unlock className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => onRemove(m)}
                          aria-label="Хасах"
                          className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-danger)]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Хүлээгдэж буй урилга</CardTitle>
            <CardDescription>
              Урилга илгээгдсэн — хэрэглэгч холбоосоор орж нууц үгээ тохируулаагүй байна
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-[var(--color-border)]">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{inv.email}</p>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {ROLE_LABEL[inv.role]} · {new Date(inv.expires_at).toLocaleDateString()}-нд
                      хүчингүй болно
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="warning">Хүлээгдэж буй</Badge>
                    <button
                      onClick={() => onCancelInvite(inv)}
                      aria-label="Урилга цуцлах"
                      title="Урилга цуцлах"
                      className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-danger)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!canManage && (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Хэрэглэгч урих / хасахын тулд админ эрх шаардлагатай.
        </p>
      )}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onDone={() => {
          setInviteOpen(false);
          reload();
        }}
      />

      <Modal
        open={confirmState !== null}
        onOpenChange={(o) => !o && setConfirmState(null)}
      >
        <ModalContent>
          <ModalHeader>
            <ModalTitle>{confirmState?.title}</ModalTitle>
            <ModalDescription>{confirmState?.message}</ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmState(null)}
            >
              Болих
            </Button>
            <Button
              type="button"
              variant={confirmState?.danger ? "danger" : "primary"}
              onClick={() => {
                confirmState?.onConfirm();
                setConfirmState(null);
              }}
            >
              {confirmState?.confirmLabel ?? "Тийм"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function InviteModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("staff");
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setRole("staff");
      setLink(null);
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await org.invite({ email: email.trim(), role });
      if (res.emailed) {
        toast({ title: "Урилга имэйлээр илгээгдлээ", tone: "success" });
        onDone();
      } else {
        // SMTP not configured — surface the link so the admin can share it.
        setLink(res.invite_url);
        toast({
          title: "Урилга үүслээ (имэйл тохируулаагүй)",
          description: "Доорх холбоосыг хуулж хэрэглэгчид өгнө үү.",
          tone: "default",
        });
      }
    } catch (e) {
      toast({
        title: "Урьж чадсангүй",
        description: e instanceof ApiError ? e.message : "Алдаа",
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
          <ModalTitle>Хэрэглэгч урих</ModalTitle>
        </ModalHeader>
        {link ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Имэйл тохируулаагүй тул дараах урилгын холбоосыг хэрэглэгчид өгнө үү:
            </p>
            <div className="flex gap-2">
              <Input readOnly value={link} onFocus={(e) => e.target.select()} />
              <Button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(link);
                  toast({ title: "Хуулагдлаа", tone: "success" });
                }}
              >
                Хуулах
              </Button>
            </div>
            <ModalFooter>
              <Button type="button" onClick={onDone}>
                Болсон
              </Button>
            </ModalFooter>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <Field label="И-мэйл" required hint="Урилгын холбоос энэ хаяг руу очно">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ажилтан@chipmo.mn"
                disabled={saving}
                autoComplete="off"
              />
            </Field>
            <Field label="Эрх" required>
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value as OrgRole)}
                disabled={saving}
              >
                {INVITE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                Болих
              </Button>
              <Button type="submit" disabled={saving || !email.trim()}>
                {saving ? "Илгээж байна…" : "Урилга илгээх"}
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
