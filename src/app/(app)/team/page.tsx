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
  Input,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { Lock, Trash2, Unlock, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Field } from "@/components/Field";
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

  if (error) return <p className="p-8 text-[var(--color-danger)]">{error}</p>;
  if (members === null) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  const myRole = members.find((m) => m.user.id === meId)?.role;
  const canManage = myRole === "owner" || myRole === "admin";

  async function onRemove(m: OrgMember) {
    if (!confirm(`${m.user.email}-г байгууллагаас хасах уу?`)) return;
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

  async function onToggleActive(m: OrgMember) {
    const lock = m.user.is_active; // currently active → we are locking
    const verb = lock ? "түгжих" : "нээх";
    if (!confirm(`${m.user.email}-ийн нэвтрэх эрхийг ${verb} үү?`)) return;
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

  async function onCancelInvite(inv: PendingInvite) {
    if (!confirm(`${inv.email}-д илгээсэн урилгыг цуцлах уу?`)) return;
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

  const selectClass =
    "h-10 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm disabled:opacity-50";

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
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as OrgRole)}
                disabled={saving}
                className={selectClass}
              >
                {INVITE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
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
