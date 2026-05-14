"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  BarChart3Icon,
  CalculatorIcon,
  DownloadIcon,
  PackageIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { InventoryValuation, SalesReport } from "@/modules/accounting";

const num = new Intl.NumberFormat("ja-JP");
const currency = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});
const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const monthDay = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
});

type Props = {
  initialValuation: InventoryValuation;
};

function formatIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfMonth(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth(), 1);
}

const today = new Date();
const DEFAULT_END = formatIsoDate(today);
const DEFAULT_START = formatIsoDate(addDays(today, -29));

export function ReportsClient({ initialValuation }: Props) {
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);

  return (
    <Tabs defaultValue="sales" className="gap-4">
      <TabsList>
        <TabsTrigger value="sales">
          <BarChart3Icon />
          売上レポート
        </TabsTrigger>
        <TabsTrigger value="inventory">
          <PackageIcon />
          在庫評価
        </TabsTrigger>
        <TabsTrigger value="export">
          <DownloadIcon />
          エクスポート
        </TabsTrigger>
      </TabsList>
      <TabsContent value="sales">
        <SalesPanel start={start} end={end} setStart={setStart} setEnd={setEnd} />
      </TabsContent>
      <TabsContent value="inventory">
        <InventoryPanel initialValuation={initialValuation} />
      </TabsContent>
      <TabsContent value="export">
        <ExportPanel start={start} end={end} setStart={setStart} setEnd={setEnd} />
      </TabsContent>
    </Tabs>
  );
}

type RangeProps = {
  start: string;
  end: string;
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
};

function DateRangeFields({
  start,
  end,
  setStart,
  setEnd,
  disabled,
  idPrefix,
}: RangeProps & { disabled?: boolean; idPrefix: string }) {
  function applyPreset(preset: "7d" | "30d" | "month" | "today") {
    const t = new Date();
    const todayStr = formatIsoDate(t);
    if (preset === "today") {
      setStart(todayStr);
      setEnd(todayStr);
    } else if (preset === "7d") {
      setStart(formatIsoDate(addDays(t, -6)));
      setEnd(todayStr);
    } else if (preset === "30d") {
      setStart(formatIsoDate(addDays(t, -29)));
      setEnd(todayStr);
    } else if (preset === "month") {
      setStart(formatIsoDate(startOfMonth(t)));
      setEnd(todayStr);
    }
  }

  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-start`}>開始日</FieldLabel>
          <Input
            id={`${idPrefix}-start`}
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            disabled={disabled}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-end`}>終了日</FieldLabel>
          <Input
            id={`${idPrefix}-end`}
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={disabled}
            required
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset("today")}
          disabled={disabled}
        >
          今日
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset("7d")}
          disabled={disabled}
        >
          過去 7 日
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset("30d")}
          disabled={disabled}
        >
          過去 30 日
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => applyPreset("month")}
          disabled={disabled}
        >
          今月
        </Button>
      </div>
    </FieldGroup>
  );
}

function validateRange(start: string, end: string): boolean {
  if (!start || !end) {
    toast.error("開始日と終了日を入力してください");
    return false;
  }
  if (end < start) {
    toast.error("終了日は開始日以降を指定してください");
    return false;
  }
  return true;
}

function SalesPanel({ start, end, setStart, setEnd }: RangeProps) {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateRange(start, end)) return;

    startTransition(async () => {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/reports/sales-report?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "売上レポートの取得に失敗しました");
        return;
      }
      const data = (await res.json()) as { report: SalesReport };
      setReport(data.report);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalculatorIcon className="size-4" />
            集計期間
          </CardTitle>
          <CardDescription>
            日付範囲を指定して売上を集計します。プリセットボタンでよく使う期間を選べます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DateRangeFields
              start={start}
              end={end}
              setStart={setStart}
              setEnd={setEnd}
              disabled={pending}
              idPrefix="sales"
            />
            <div>
              <Button type="submit" disabled={pending}>
                <BarChart3Icon />
                {pending ? "集計中..." : "集計"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {report ? <SalesResults report={report} /> : null}
    </div>
  );
}

function SalesResults({ report }: { report: SalesReport }) {
  const hasData = report.by_date.length > 0 || report.by_product.length > 0;

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>集計結果</CardTitle>
          <CardDescription>
            {report.start_date} 〜 {report.end_date}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground py-8 text-center text-sm">
            該当期間に売上がありません
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>日別売上</CardTitle>
          <CardDescription>
            {report.start_date} 〜 {report.end_date} ／ 合計: {currency.format(report.grand_total)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SalesBarChart points={report.by_date} />
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">日付</TableHead>
                  <TableHead className="text-right">売上合計</TableHead>
                  <TableHead className="pr-4 text-right">件数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.by_date.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground h-24 text-center">
                      日別データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  report.by_date.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell className="pl-4 tabular-nums">
                        {dateFmt.format(new Date(`${d.date}T00:00:00`))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {currency.format(d.total_sales)}
                      </TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">
                        {num.format(d.transaction_count)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>商品別集計</CardTitle>
          <CardDescription>売上額の高い順に表示します。</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">商品名</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead className="pr-4 text-right">売上合計</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.by_product.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground h-24 text-center">
                      商品別データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  report.by_product.map((p) => (
                    <TableRow key={p.product_id}>
                      <TableCell className="pl-4 font-medium">{p.product_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num.format(p.total_quantity)}
                      </TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">
                        {currency.format(p.total_sales)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SalesBarChart({ points }: { points: SalesReport["by_date"] }) {
  const max = useMemo(() => points.reduce((m, p) => Math.max(m, p.total_sales), 0), [points]);

  if (points.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">日別データがありません</div>
    );
  }

  return (
    <div className="flex h-48 items-end gap-1 sm:gap-2">
      {points.map((p) => {
        const ratio = max > 0 ? p.total_sales / max : 0;
        const heightPct = max > 0 ? Math.max(ratio * 100, p.total_sales > 0 ? 4 : 0) : 0;
        return (
          <div key={p.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="text-muted-foreground truncate text-[10px] tabular-nums">
              {p.total_sales > 0 ? `¥${num.format(Math.round(p.total_sales))}` : ""}
            </div>
            <div
              className="bg-primary/80 hover:bg-primary w-full rounded-t transition-colors"
              style={{ height: `${heightPct}%`, minHeight: p.total_sales > 0 ? "4px" : "0" }}
              title={`${p.date}: ${currency.format(p.total_sales)} (${p.transaction_count}件)`}
            />
            <div className="text-muted-foreground text-[10px] tabular-nums">
              {monthDay.format(new Date(`${p.date}T00:00:00`))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InventoryPanel({ initialValuation }: { initialValuation: InventoryValuation }) {
  const [valuation, setValuation] = useState<InventoryValuation>(initialValuation);
  const [pending, startTransition] = useTransition();

  function handleRefresh() {
    startTransition(async () => {
      const res = await fetch("/api/reports/inventory-value", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "在庫評価の取得に失敗しました");
        return;
      }
      const data = (await res.json()) as { valuation: InventoryValuation };
      setValuation(data.valuation);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageIcon className="size-4" />
          在庫評価
        </CardTitle>
        <CardDescription>現在の在庫数量と原価から評価額を算出します。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">在庫評価額 合計</span>
            <span className="text-2xl font-semibold tabular-nums">
              {currency.format(valuation.total_value)}
            </span>
          </div>
          <Button type="button" variant="outline" onClick={handleRefresh} disabled={pending}>
            <RefreshCwIcon />
            {pending ? "再計算中..." : "再計算"}
          </Button>
        </div>

        <div className="overflow-x-auto border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">SKU</TableHead>
                <TableHead>商品名</TableHead>
                <TableHead className="text-right">単価</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="pr-4 text-right">評価額</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {valuation.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground h-24 text-center">
                    在庫がありません
                  </TableCell>
                </TableRow>
              ) : (
                valuation.items.map((item) => (
                  <TableRow key={item.product_id}>
                    <TableCell className="text-muted-foreground pl-4 font-mono text-xs">
                      {item.sku}
                    </TableCell>
                    <TableCell className="font-medium">{item.product_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency.format(item.cost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num.format(item.total_quantity)}
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">
                      {currency.format(item.total_value)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ExportPanel({ start, end, setStart, setEnd }: RangeProps) {
  function handleSalesDownload() {
    if (!validateRange(start, end)) return;
    const params = new URLSearchParams({ start, end });
    window.location.href = `/api/reports/export?${params.toString()}`;
  }

  function handleInventoryDownload() {
    window.location.href = "/api/reports/inventory-export";
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DownloadIcon className="size-4" />
            売上データ CSV
          </CardTitle>
          <CardDescription>
            指定期間の日別売上 (date, total_sales, transaction_count) を CSV で出力します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSalesDownload();
            }}
            className="flex flex-col gap-4"
          >
            <DateRangeFields
              start={start}
              end={end}
              setStart={setStart}
              setEnd={setEnd}
              idPrefix="export-sales"
            />
            <div>
              <Button type="submit">
                <DownloadIcon />
                売上 CSV をダウンロード
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DownloadIcon className="size-4" />
            在庫データ CSV
          </CardTitle>
          <CardDescription>
            現時点の在庫評価 (sku, 商品名, 単価, 数量, 評価額) を CSV で出力します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={handleInventoryDownload}>
            <DownloadIcon />
            在庫 CSV をダウンロード
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
