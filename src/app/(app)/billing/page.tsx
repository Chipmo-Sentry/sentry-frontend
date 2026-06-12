"use client";

/** T14 — Хэтэвч/төлбөрийн хуудас.
 *
 * Үлдэгдлийн карт + тарифын задаргаа + цэнэглэх заавар + промо код +
 * гүйлгээний түүх (offset pagination). Бүх дүн ₮ (MNT), mn-MN форматаар.
 */

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
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chipmo-sentry/ui-kit";
import { ReceiptText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { invalidateBillingSummary } from "@/components/BillingBanner";
import { useToast } from "@/components/Toaster";
import {
  ApiError,
  billing,
  type BillingStatus,
  type BillingSummary,
  type JournalEntry,
  type JournalKind,
} from "@/lib/api";
import {
  BILLING_STATUS_LABEL,
  JOURNAL_KIND_LABEL,
  TIER_LABEL,
} from "@/lib/labels";
import { absoluteTime } from "@/lib/time";

const JOURNAL_PAGE = 20;

const MNT = new Intl.NumberFormat("mn-MN");
function fmtMNT(v: number): string {
  return `${MNT.format(v)} ₮`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("mn-MN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function fmtDate(iso: string): string {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? iso : DATE_FORMAT.format(t);
}

const STATUS_TONE: Record<BillingStatus, "success" | "warning" | "danger"> = {
  active: "success",
  credit: "warning",
  suspended: "danger",
};

// Гүйлгээний төрлийн badge өнгө: цэнэглэлт ногоон, хэрэглээ саарал,
// промо цэнхэр (level-log), залруулга шар.
const KIND_TONE: Record<
  JournalKind,
  "success" | "neutral" | "log" | "warning"
> = {
  topup: "success",
  usage_charge: "neutral",
  promo_credit: "log",
  adjustment: "warning",
};

const TIER_TONE: Record<string, "neutral" | "log" | "notify"> = {
  starter: "neutral",
  pro: "log",
  enterprise: "notify",
};

export default function BillingPage() {
  const { toast } = useToast();

  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [journal, setJournal] = useState<JournalEntry[] | null>(null);
  const [journalDone, setJournalDone] = useState(false);
  const [journalLoading, setJournalLoading] = useState(false);

  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);

  const loadSummary = useCallback(() => {
    setError(null);
    let cancelled = false;
    billing.summary().then(
      (s) => {
        if (!cancelled) setSummary(s);
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Алдаа");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const loadJournal = useCallback(async (offset: number) => {
    setJournalLoading(true);
    try {
      const page = await billing.journal({ limit: JOURNAL_PAGE, offset });
      setJournal((prev) => (offset === 0 ? page : [...(prev ?? []), ...page]));
      if (page.length < JOURNAL_PAGE) setJournalDone(true);
    } catch {
      // Түүх ачаалагдахгүй бол хүснэгтийн хэсэгт л empty state үлдэнэ —
      // хуудсыг бүхэлд нь унагаахгүй.
      setJournal((prev) => prev ?? []);
      setJournalDone(true);
    } finally {
      setJournalLoading(false);
    }
  }, []);

  useEffect(() => loadSummary(), [loadSummary]);
  useEffect(() => {
    loadJournal(0);
  }, [loadJournal]);

  async function onRedeemPromo(e: React.FormEvent) {
    e.preventDefault();
    const code = promoCode.trim();
    if (!code || promoBusy) return;
    setPromoBusy(true);
    setPromoError(null);
    try {
      await billing.redeemPromo(code);
      toast({ title: "Промо код идэвхжлээ", tone: "success" });
      setPromoCode("");
      invalidateBillingSummary();
      loadSummary();
      setJournalDone(false);
      loadJournal(0);
    } catch (err) {
      setPromoError(
        err instanceof ApiError ? err.message : "Алдаа гарлаа. Дахин оролдоно уу.",
      );
    } finally {
      setPromoBusy(false);
    }
  }

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={loadSummary} />
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="p-8">
        <Spinner label="Уншиж байна…" />
      </div>
    );
  }

  const promoActive =
    summary.promo_free_until !== null &&
    new Date(summary.promo_free_until).getTime() > Date.now();
  const daysLeft =
    summary.status === "active" &&
    summary.daily_rate_mnt > 0 &&
    summary.balance_mnt > 0
      ? Math.floor(summary.balance_mnt / summary.daily_rate_mnt)
      : null;

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Төлбөр</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Үлдэгдэл */}
        <Card>
          <CardHeader>
            <CardDescription>Хэтэвчний үлдэгдэл</CardDescription>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle
                className={`text-3xl ${
                  summary.balance_mnt < 0
                    ? "text-[var(--color-danger)]"
                    : "text-[var(--color-foreground)]"
                }`}
              >
                {fmtMNT(summary.balance_mnt)}
              </CardTitle>
              <Badge tone={STATUS_TONE[summary.status]}>
                {BILLING_STATUS_LABEL[summary.status]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-[var(--color-muted-foreground)]">
            <p>Өдрийн тариф: {fmtMNT(summary.daily_rate_mnt)}</p>
            {daysLeft !== null && (
              <p>Ойролцоогоор {daysLeft} өдөр хүрэлцэнэ</p>
            )}
            {promoActive && summary.promo_free_until && (
              <p className="text-[var(--color-level-log)]">
                Промо: {fmtDate(summary.promo_free_until)} хүртэл үнэгүй
              </p>
            )}
            {summary.status === "credit" && summary.credit_until && (
              <p className="text-[var(--color-warning)]">
                Түр нээлттэй хугацаа: {fmtDate(summary.credit_until)} хүртэл
              </p>
            )}
          </CardContent>
        </Card>

        {/* Цэнэглэх заавар */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Хэтэвч цэнэглэх</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Хэтэвчээ цэнэглэхийн тулд манай данс руу шилжүүлэг хийгээд
              гүйлгээний утга дээр байгууллагынхаа нэрийг бичнэ үү. Бид ажлын
              цагт бүртгэж баталгаажуулна.
            </p>
            {/* TODO(founder): дансны дугаар, банкны нэрийг энд нэмэх. */}
            <p className="text-[var(--color-muted-foreground)]">
              Холбоо барих:{" "}
              <a
                href="mailto:hello@chipmo.mn"
                className="font-medium text-[var(--color-primary)] hover:underline"
              >
                hello@chipmo.mn
              </a>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Тарифын задаргаа */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Тарифын задаргаа</CardTitle>
          <CardDescription>
            Дэлгүүр тус бүрийн идэвхтэй камер, багц болон сарын төлбөр
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.stores.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Дэлгүүр алга"
              description="Дэлгүүр болон камер бүртгэгдсэний дараа тариф энд харагдана."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дэлгүүр</TableHead>
                    <TableHead>Идэвхтэй камер</TableHead>
                    <TableHead>Багц</TableHead>
                    <TableHead className="text-right">Платформ төлбөр</TableHead>
                    <TableHead className="text-right">Камерын үнэ</TableHead>
                    <TableHead className="text-right">Сарын дүн</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.stores.map((s) => (
                    <TableRow key={s.store_id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.active_cameras}</TableCell>
                      <TableCell>
                        {s.tier ? (
                          <Badge tone={TIER_TONE[s.tier] ?? "neutral"}>
                            {TIER_LABEL[s.tier] ?? s.tier}
                          </Badge>
                        ) : (
                          <span className="text-[var(--color-muted-foreground)]">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMNT(s.platform_fee_mnt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMNT(s.camera_fee_mnt)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtMNT(s.monthly_mnt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-[var(--color-border)] pt-3 text-sm">
                <span className="text-[var(--color-muted-foreground)]">
                  Нийт сарын дүн:{" "}
                  <span className="font-semibold text-[var(--color-foreground)]">
                    {fmtMNT(summary.monthly_rate_mnt)}
                  </span>
                </span>
                <span className="text-[var(--color-muted-foreground)]">
                  Өдрийн дүн:{" "}
                  <span className="font-semibold text-[var(--color-foreground)]">
                    {fmtMNT(summary.daily_rate_mnt)}
                  </span>
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Промо код */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Промо код</CardTitle>
          <CardDescription>
            Промо кодтой бол энд оруулж идэвхжүүлнэ үү
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={onRedeemPromo}
            className="flex max-w-md flex-wrap items-end gap-2"
          >
            <div className="min-w-48 flex-1">
              <Field label="Код" error={promoError ?? undefined}>
                <Input
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value);
                    setPromoError(null);
                  }}
                  placeholder="PROMO2026"
                  autoComplete="off"
                />
              </Field>
            </div>
            <Button type="submit" disabled={promoBusy || !promoCode.trim()}>
              {promoBusy ? "Шалгаж байна…" : "Идэвхжүүлэх"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Гүйлгээний түүх */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Гүйлгээний түүх</CardTitle>
        </CardHeader>
        <CardContent>
          {journal === null ? (
            <Spinner />
          ) : journal.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Гүйлгээ алга"
              description="Одоогоор гүйлгээ бүртгэгдээгүй байна."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Огноо</TableHead>
                    <TableHead>Төрөл</TableHead>
                    <TableHead className="text-right">Дүн</TableHead>
                    <TableHead>Тайлбар</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journal.map((j) => {
                    // Чиглэл: cr=org_wallet → хэтэвч рүү орлого (+), бусад нь
                    // хэтэвчнээс зарлага (−). amount_mnt үргэлж эерэг ирдэг.
                    const income = j.cr_account === "org_wallet";
                    return (
                      <TableRow key={j.id}>
                        <TableCell className="whitespace-nowrap">
                          {absoluteTime(j.posted_at)}
                        </TableCell>
                        <TableCell>
                          <Badge tone={KIND_TONE[j.kind] ?? "neutral"}>
                            {JOURNAL_KIND_LABEL[j.kind] ?? j.kind}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`whitespace-nowrap text-right font-medium ${
                            income
                              ? "text-[var(--color-success)]"
                              : "text-[var(--color-foreground)]"
                          }`}
                        >
                          {income ? "+" : "−"}
                          {fmtMNT(j.amount_mnt)}
                        </TableCell>
                        <TableCell className="text-[var(--color-muted-foreground)]">
                          {j.description}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {!journalDone && (
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="outline"
                    disabled={journalLoading}
                    onClick={() => loadJournal(journal.length)}
                  >
                    {journalLoading ? "Ачаалж байна…" : "Цааш ачаалах"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
