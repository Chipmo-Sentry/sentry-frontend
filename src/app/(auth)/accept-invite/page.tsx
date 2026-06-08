"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Logo,
} from "@chipmo-sentry/ui-kit";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Field } from "@/components/Field";
import { org, ApiError } from "@/lib/api";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Нууц үг хамгийн багадаа 8 тэмдэгт байх ёстой.");
      return;
    }
    if (password !== confirm) {
      setError("Нууц үг таарахгүй байна.");
      return;
    }
    setBusy(true);
    try {
      await org.acceptInvite({ token, password });
      setDone(true);
      setTimeout(() => router.push("/login"), 1800);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Алдаа гарлаа.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-muted)] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mx-auto mb-2 h-8 w-8" />
          <CardTitle>Урилгыг хүлээн авах</CardTitle>
        </CardHeader>
        <CardContent>
          {!token ? (
            <p className="text-sm text-[var(--color-danger)]">
              Урилгын холбоос буруу байна (token алга).
            </p>
          ) : done ? (
            <p className="text-sm text-[var(--color-success,#16a34a)]">
              Бүртгэл амжилттай! Нэвтрэх хуудас руу шилжиж байна…
            </p>
          ) : (
            <form className="space-y-4" onSubmit={onSubmit}>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Бүртгэлээ идэвхжүүлэхийн тулд нууц үгээ тохируулна уу.
              </p>
              <Field label="Нууц үг" required hint="Хамгийн багадаа 8 тэмдэгт">
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Нууц үг давтах" required>
                <Input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={busy}
                  autoComplete="new-password"
                />
              </Field>
              {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Хадгалж байна…" : "Бүртгэл идэвхжүүлэх"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
