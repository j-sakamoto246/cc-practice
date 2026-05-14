"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ParsedProductCsvRow } from "@/modules/product-import";

export function ImportClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<ParsedProductCsvRow[]>([]);
  const [previewed, setPreviewed] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setCsv(result);
        setRows([]);
        setPreviewed(false);
      }
    };
    reader.onerror = () => {
      toast.error("ファイルの読み込みに失敗しました");
    };
    reader.readAsText(file);
  }

  function handlePreview() {
    if (!csv.trim()) {
      toast.error("CSV の内容を入力してください");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/products/import?action=preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "プレビューに失敗しました");
        setRows([]);
        setPreviewed(false);
        return;
      }
      const data = (await res.json()) as { rows: ParsedProductCsvRow[] };
      setRows(data.rows);
      setPreviewed(true);
      toast.success(`${data.rows.length} 件をプレビューしました`);
    });
  }

  function handleImport() {
    if (!csv.trim()) {
      toast.error("CSV の内容を入力してください");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "インポートに失敗しました");
        return;
      }
      const data = (await res.json()) as { imported: number };
      toast.success(`${data.imported} 件の商品をインポートしました`);
      setCsv("");
      setRows([]);
      setPreviewed(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>CSV を読み込み</CardTitle>
          <CardDescription>
            ファイルを選択するか、テキストエリアに直接ペーストできます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="import-file">CSV ファイル</FieldLabel>
              <Input
                ref={fileInputRef}
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                disabled={pending}
              />
              <FieldDescription>
                必須: sku, name, price / 任意: cost, description, min_quantity
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="import-text">CSV テキスト</FieldLabel>
              <textarea
                id="import-text"
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setPreviewed(false);
                  setRows([]);
                }}
                disabled={pending}
                rows={8}
                placeholder={
                  "sku,name,price,cost,min_quantity,description\nSKU-001,サンプル商品,1000,600,5,説明"
                }
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-full rounded-md border bg-transparent px-3 py-2 font-mono text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handlePreview} disabled={pending}>
                {pending ? "処理中..." : "プレビュー"}
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={handleImport}
                disabled={pending || !previewed || rows.length === 0}
              >
                {pending ? "処理中..." : "インポート実行"}
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>プレビュー結果</CardTitle>
          <CardDescription>
            {rows.length > 0
              ? `${rows.length} 件の商品が読み込まれました。`
              : "プレビューしてください"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-muted-foreground flex h-24 items-center justify-center text-sm">
              プレビューしてください
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[1%] text-right">行番号</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>商品名</TableHead>
                    <TableHead className="text-right">価格</TableHead>
                    <TableHead className="text-right">原価</TableHead>
                    <TableHead className="text-right">最低在庫</TableHead>
                    <TableHead>説明</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="text-right tabular-nums">{row.rowNumber}</TableCell>
                      <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        ¥{row.price.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ¥{row.cost.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.minQuantity}</TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {row.description || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
