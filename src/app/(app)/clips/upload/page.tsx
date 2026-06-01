"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from "@chipmo-sentry/ui-kit";
import { Upload } from "lucide-react";
import { useEffect, useState } from "react";

import { useToast } from "@/components/Toaster";
import { ApiError, clips, stores } from "@/lib/api";
import type { ClipPublic, StorePublic } from "@/lib/types";

export default function UploadPage() {
  const { toast } = useToast();
  const [storeList, setStoreList] = useState<StorePublic[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClipPublic | null>(null);

  useEffect(() => {
    stores.list().then(
      (list) => {
        setStoreList(list);
        if (list[0]) setStoreId(list[0].id);
      },
      (e) => setError(e instanceof Error ? e.message : "Дэлгүүр уншигдсангүй"),
    );
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !storeId) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const clip = await clips.upload({ file, store_id: storeId });
      setResult(clip);
      setFile(null);
      toast({
        title: "Видео илгээгдлээ",
        description: "AI боловсруулж байна — үр дүн Сэжигтэй үйлдэл хэсэгт гарна.",
        tone: "success",
      });
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Илгээх явцад алдаа гарлаа";
      setError(msg);
      toast({ title: "Илгээж чадсангүй", description: msg, tone: "danger" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Видео илгээх</h1>
      <Card>
        <CardHeader>
          <CardTitle>MP4 клип илгээх</CardTitle>
          <CardDescription>
            Сэжигтэй мөчийг агуулсан 5-10 секундын клипийг illgEEnee. AI-аас
            үр дүнг 10-15 секундын дотор хүлээж авна.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium">Дэлгүүр</label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                required
                disabled={uploading || storeList.length === 0}
                className="h-10 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
              >
                {storeList.length === 0 ? (
                  <option value="">— Дэлгүүр бүртгэгдээгүй —</option>
                ) : (
                  storeList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Видео</label>
              <label
                htmlFor="clip-file"
                className="flex h-32 cursor-pointer items-center justify-center rounded-[var(--radius)] border-2 border-dashed border-[var(--color-border)] bg-[var(--color-background)] text-sm text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]"
              >
                <Upload className="mr-2 h-4 w-4" />
                {file ? file.name : "MP4 файл сонгоно уу"}
                <input
                  id="clip-file"
                  type="file"
                  accept="video/mp4"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                />
              </label>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-[var(--color-danger)]">
                {error}
              </p>
            ) : null}

            {result ? (
              <div className="rounded-[var(--radius)] border border-[var(--color-success)] bg-[var(--color-muted)] p-3 text-sm">
                ✅ Илгээгдсэн. Clip ID:{" "}
                <code className="font-mono">{result.id}</code>
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={!file || !storeId || uploading}
              className="w-full"
            >
              {uploading ? <Spinner label="Илгээж байна…" /> : "Илгээх"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
