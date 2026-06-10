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
  Input,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { Building2, Plus, ShieldAlert, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { Field } from "@/components/Field";
import { useToast } from "@/components/Toaster";
import { admin, ApiError } from "@/lib/api";
import type { OrganizationPublic, OrgRole } from "@/lib/types";

const ROLES: { value: OrgRole; label: string }[] = [
  { value: "owner", label: "Эзэмшигч (owner)" },
  { value: "admin", label: "Админ (admin)" },
  { value: "staff", label: "Ажилтан (staff)" },
];

export default function AdminPage() {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<OrganizationPublic[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgModal, setOrgModal] = useState(false);
  const [inviteModal, setInviteModal] = useState(false);

  async function reload() {
    try {
      setOrgs(await admin.listOrgs());
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
        setForbidden(true);
      } else {
        setError(e instanceof Error ? e.message : "Алдаа");
      }
    }
  }

  useEffect(() => {
    reload();
  }, []);

  if (forbidden) {
    return (
      <div className="p-8">
        <EmptyState
          icon={ShieldAlert}
          title="Хандах эрхгүй"
          description="Энэ хэсэг зөвхөн супер админд зориулагдсан."
        />
      </div>
    );
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
  if (orgs === null) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Админ</h1>

      {/* Organizations */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Байгууллагууд</CardTitle>
            <CardDescription>Нийт {orgs.length}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setOrgModal(true)}>
            <Plus className="h-4 w-4" />
            Шинэ орг
          </Button>
        </CardHeader>
        <CardContent>
          {orgs.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Байгууллага алга"
              description="Эхний байгууллагаа үүсгэнэ үү."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {orgs.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="font-medium">{o.name}</span>
                  <Badge tone="neutral">{o.slug}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Invite user */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Хэрэглэгч урих</CardTitle>
            <CardDescription>
              Шинэ хэрэглэгч үүсгэж байгууллагад нэмнэ
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setInviteModal(true)}
            disabled={orgs.length === 0}
          >
            <UserPlus className="h-4 w-4" />
            Урих
          </Button>
        </CardHeader>
      </Card>

      <OrgFormModal
        open={orgModal}
        onClose={() => setOrgModal(false)}
        onSaved={() => {
          setOrgModal(false);
          reload();
        }}
      />
      <InviteUserModal
        open={inviteModal}
        orgs={orgs}
        onClose={() => setInviteModal(false)}
        onSaved={() => {
          setInviteModal(false);
          toast({ title: "Хэрэглэгч уригдлаа", tone: "success" });
        }}
      />
    </div>
  );
}

function OrgFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setSlug("");
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await admin.createOrg({ name: name.trim(), slug: slug.trim() });
      toast({ title: "Байгууллага үүслээ", tone: "success" });
      onSaved();
    } catch (e) {
      toast({
        title: "Үүсгэж чадсангүй",
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
          <ModalTitle>Шинэ байгууллага</ModalTitle>
        </ModalHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Нэр" required>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Жишээ: Номин Холдинг"
              disabled={saving}
            />
          </Field>
          <Field
            label="Slug"
            required
            hint="Зөвхөн жижиг үсэг, тоо, зураас (a-z, 0-9, -)"
          >
            <Input
              required
              pattern="[a-z0-9][a-z0-9-]*"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="nomin-holding"
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
            <Button type="submit" disabled={saving || !name.trim() || !slug.trim()}>
              {saving ? "Хадгалж байна…" : "Үүсгэх"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

function InviteUserModal({
  open,
  orgs,
  onClose,
  onSaved,
}: {
  open: boolean;
  orgs: OrganizationPublic[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgId, setOrgId] = useState("");
  const [role, setRole] = useState<OrgRole>("staff");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setPassword("");
    setOrgId(orgs[0]?.id ?? "");
    setRole("staff");
    setIsSuperAdmin(false);
  }, [open, orgs]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await admin.inviteUser({
        email: email.trim(),
        password,
        organization_id: orgId,
        role,
        is_super_admin: isSuperAdmin,
      });
      onSaved();
    } catch (e) {
      toast({
        title: "Урьж чадсангүй",
        description: e instanceof Error ? e.message : "Алдаа",
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
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="И-мэйл" required>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="хэрэглэгч@chipmo.mn"
              disabled={saving}
              autoComplete="off"
            />
          </Field>
          <Field label="Нууц үг" required hint="Хамгийн багадаа 8 тэмдэгт">
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Байгууллага" required>
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              required
              disabled={saving}
              className={selectClass}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Эрх" required>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as OrgRole)}
              disabled={saving}
              className={selectClass}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isSuperAdmin}
              onChange={(e) => setIsSuperAdmin(e.target.checked)}
              disabled={saving}
              className="h-4 w-4"
            />
            Супер админ эрх олгох
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
              disabled={saving || !email.trim() || password.length < 8 || !orgId}
            >
              {saving ? "Урьж байна…" : "Урих"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
