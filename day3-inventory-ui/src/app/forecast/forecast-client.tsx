"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CalculatorIcon, TrendingUpIcon } from "lucide-react";

import { toast } from "@/lib/toast";

import { Badge } from "@/components/ui/badge";
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
import type { ProductForecast } from "@/modules/forecast";
import type { Product } from "@/modules/product";
import type { Warehouse } from "@/modules/stock";

type Props = {
  products: Product[];
  warehouses: Warehouse[];
};

const CONFIDENCE_OPTIONS = ["0.80", "0.85", "0.90", "0.95", "0.99"] as const;

const intFmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const oneFmt = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const twoFmt = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const selectClass =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

export function ForecastClient({ products, warehouses }: Props) {
  const [sku, setSku] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [days, setDays] = useState("30");
  const [confidence, setConfidence] = useState<string>("0.95");
  const [orderCost, setOrderCost] = useState("1000");
  const [holdingRate, setHoldingRate] = useState("0.2");

  const [forecasts, setForecasts] = useState<ProductForecast[] | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const daysNum = Number(days);
    const confidenceNum = Number(confidence);
    const orderCostNum = Number(orderCost);
    const holdingRateNum = Number(holdingRate);

    if (!Number.isInteger(daysNum) || daysNum <= 0) {
      toast.error("集計日数は 1 以上の整数を入力してください");
      return;
    }
    if (!Number.isFinite(orderCostNum) || orderCostNum < 0) {
      toast.error("発注コストは 0 以上の数値を入力してください");
      return;
    }
    if (!Number.isFinite(holdingRateNum) || holdingRateNum < 0) {
      toast.error("保管費率は 0 以上の数値を入力してください");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: sku || undefined,
          warehouseId: warehouseId || undefined,
          days: daysNum,
          confidence: confidenceNum,
          orderCost: orderCostNum,
          holdingRate: holdingRateNum,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "需要予測の計算に失敗しました");
        return;
      }
      const data = (await res.json()) as { forecasts: ProductForecast[] };
      setForecasts(data.forecasts);
      toast.success(`${data.forecasts.length} 件の予測を計算しました`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalculatorIcon className="size-4" />
            予測条件
          </CardTitle>
          <CardDescription>
            集計期間と統計パラメータを指定して、安全在庫・発注点・推奨発注量を計算します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FieldGroup>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="forecast-sku">商品</FieldLabel>
                  <select
                    id="forecast-sku"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    disabled={pending}
                    className={selectClass}
                  >
                    <option value="">すべての商品</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.sku}>
                        {p.sku} - {p.name}
                      </option>
                    ))}
                  </select>
                  <FieldDescription>未指定で全商品を予測します。</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="forecast-warehouse">倉庫</FieldLabel>
                  <select
                    id="forecast-warehouse"
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    disabled={pending}
                    className={selectClass}
                  >
                    <option value="">すべての倉庫</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                        {w.location ? `（${w.location}）` : ""}
                      </option>
                    ))}
                  </select>
                  <FieldDescription>未指定で全倉庫を合算します。</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="forecast-days">集計日数</FieldLabel>
                  <Input
                    id="forecast-days"
                    type="number"
                    min="1"
                    step="1"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    disabled={pending}
                    required
                  />
                  <FieldDescription>過去何日分の出庫実績を集計するか。</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="forecast-confidence">信頼水準</FieldLabel>
                  <select
                    id="forecast-confidence"
                    value={confidence}
                    onChange={(e) => setConfidence(e.target.value)}
                    disabled={pending}
                    className={selectClass}
                  >
                    {CONFIDENCE_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <FieldDescription>安全在庫の Z 値計算に使われます。</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="forecast-order-cost">発注コスト</FieldLabel>
                  <Input
                    id="forecast-order-cost"
                    type="number"
                    min="0"
                    step="1"
                    value={orderCost}
                    onChange={(e) => setOrderCost(e.target.value)}
                    disabled={pending}
                    required
                  />
                  <FieldDescription>発注 1 回あたりの固定費 (EOQ 計算用)。</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="forecast-holding-rate">保管費率</FieldLabel>
                  <Input
                    id="forecast-holding-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={holdingRate}
                    onChange={(e) => setHoldingRate(e.target.value)}
                    disabled={pending}
                    required
                  />
                  <FieldDescription>年間保管費 / 単価。</FieldDescription>
                </Field>
              </div>
            </FieldGroup>

            <div>
              <Button type="submit" disabled={pending}>
                <TrendingUpIcon />
                {pending ? "計算中..." : "予測する"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <ForecastResult forecasts={forecasts} />
    </div>
  );
}

function ForecastResult({ forecasts }: { forecasts: ProductForecast[] | null }) {
  const period = forecasts && forecasts.length > 0 ? forecasts[0] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUpIcon className="size-4" />
          予測結果
        </CardTitle>
        {period ? (
          <CardDescription>
            集計期間: {period.start_date} 〜 {period.end_date}
          </CardDescription>
        ) : (
          <CardDescription>
            予測条件を入力して「予測する」を押すと、ここに結果が表示されます。
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="px-0">
        {forecasts === null ? (
          <div className="text-muted-foreground px-4 py-12 text-center text-sm">
            予測条件を入力して「予測する」を押してください
          </div>
        ) : forecasts.length === 0 ? (
          <div className="text-muted-foreground px-4 py-12 text-center text-sm">
            条件に該当する商品がありません
          </div>
        ) : (
          <div className="overflow-x-auto border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">SKU</TableHead>
                  <TableHead>商品名</TableHead>
                  <TableHead className="text-right">現在庫</TableHead>
                  <TableHead className="text-right">平均日次需要</TableHead>
                  <TableHead className="text-right">標準偏差</TableHead>
                  <TableHead className="text-right">安全在庫</TableHead>
                  <TableHead className="text-right">発注点</TableHead>
                  <TableHead className="text-right">EOQ</TableHead>
                  <TableHead className="pr-4 text-right">推奨発注量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecasts.map((f) => {
                  const reorder = f.recommended_order > 0;
                  return (
                    <TableRow key={f.product_id} className={reorder ? "bg-amber-50" : undefined}>
                      <TableCell className="pl-4 font-mono text-xs">{f.sku}</TableCell>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {intFmt.format(f.on_hand)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {twoFmt.format(f.avg_daily_demand)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {twoFmt.format(f.std_daily_demand)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {oneFmt.format(f.safety_stock)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {oneFmt.format(f.reorder_point)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {oneFmt.format(f.eoq)}
                      </TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">
                        <div className="flex items-center justify-end gap-2">
                          {reorder ? (
                            <Badge variant="destructive" className="gap-1">
                              要発注
                            </Badge>
                          ) : null}
                          <span>{oneFmt.format(f.recommended_order)}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
