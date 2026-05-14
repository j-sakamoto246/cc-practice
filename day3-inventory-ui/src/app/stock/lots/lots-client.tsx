"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangleIcon, CalendarClockIcon, LayersIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { Product } from "@/modules/product";
import type { ExpiringLot, StockLotRow, Warehouse } from "@/modules/stock";

const num = new Intl.NumberFormat("ja-JP");
const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type Props = {
  initialLots: StockLotRow[];
  products: Product[];
  warehouses: Warehouse[];
};

export function LotsClient({ initialLots, products, warehouses }: Props) {
  return (
    <Tabs defaultValue="lots" className="gap-4">
      <TabsList>
        <TabsTrigger value="lots">
          <LayersIcon />
          ロット一覧
        </TabsTrigger>
        <TabsTrigger value="expiring">
          <CalendarClockIcon />
          期限間近
        </TabsTrigger>
      </TabsList>
      <TabsContent value="lots">
        <LotsPanel initialLots={initialLots} products={products} warehouses={warehouses} />
      </TabsContent>
      <TabsContent value="expiring">
        <ExpiringPanel />
      </TabsContent>
    </Tabs>
  );
}

function LotsPanel({ initialLots, products, warehouses }: Props) {
  const [lots, setLots] = useState<StockLotRow[]>(initialLots);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [pending, startTransition] = useTransition();

  function fetchLots(next: { productId?: string; warehouseId?: string; includeEmpty?: boolean }) {
    const nextProduct = next.productId ?? productId;
    const nextWarehouse = next.warehouseId ?? warehouseId;
    const nextInclude = next.includeEmpty ?? includeEmpty;

    startTransition(async () => {
      const params = new URLSearchParams();
      if (nextProduct) params.set("product_id", nextProduct);
      if (nextWarehouse) params.set("warehouse_id", nextWarehouse);
      if (nextInclude) params.set("include_empty", "true");

      const qs = params.toString();
      const res = await fetch(`/api/stock/lots${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "ロット一覧の取得に失敗しました");
        return;
      }
      const data = (await res.json()) as { lots: StockLotRow[] };
      setLots(data.lots);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayersIcon className="size-4" />
          ロット一覧
        </CardTitle>
        <CardDescription>
          商品・倉庫で絞り込み、在庫が残っているロットや期限を確認します。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        <div className="grid gap-3 px-4 sm:grid-cols-2 lg:grid-cols-3">
          <select
            value={productId}
            onChange={(e) => {
              const next = e.target.value;
              setProductId(next);
              fetchLots({ productId: next });
            }}
            disabled={pending}
            aria-label="商品で絞り込み"
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">すべての商品</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} - {p.name}
              </option>
            ))}
          </select>
          <select
            value={warehouseId}
            onChange={(e) => {
              const next = e.target.value;
              setWarehouseId(next);
              fetchLots({ warehouseId: next });
            }}
            disabled={pending}
            aria-label="倉庫で絞り込み"
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">すべての倉庫</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <label className="text-muted-foreground inline-flex h-8 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeEmpty}
              onChange={(e) => {
                const next = e.target.checked;
                setIncludeEmpty(next);
                fetchLots({ includeEmpty: next });
              }}
              disabled={pending}
              className="border-input size-4 rounded border"
            />
            在庫 0 を含む
          </label>
        </div>

        <div className="overflow-x-auto border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">SKU</TableHead>
                <TableHead>商品名</TableHead>
                <TableHead>倉庫</TableHead>
                <TableHead>ロットコード</TableHead>
                <TableHead className="text-right">残量</TableHead>
                <TableHead>期限</TableHead>
                <TableHead className="pr-4">入庫日</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                    {pending ? "読み込み中..." : "ロットがありません"}
                  </TableCell>
                </TableRow>
              ) : (
                lots.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground pl-4 font-mono text-xs">
                      {l.sku}
                    </TableCell>
                    <TableCell className="font-medium">{l.product_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{l.warehouse_name}</TableCell>
                    <TableCell className="font-mono text-xs">{l.lot_code || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num.format(l.quantity_remaining)}
                    </TableCell>
                    <TableCell>
                      <ExpiryCell expiryDate={l.expiry_date} />
                    </TableCell>
                    <TableCell className="text-muted-foreground pr-4 text-xs whitespace-nowrap tabular-nums">
                      {dateFmt.format(new Date(`${l.received_at}Z`))}
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

function ExpiryCell({ expiryDate }: { expiryDate: string | null }) {
  if (!expiryDate) {
    return <span className="text-muted-foreground">-</span>;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const diffDays = Math.floor((expiry.getTime() - today.getTime()) / 86400000);
  const formatted = dateFmt.format(expiry);

  if (diffDays <= 0) {
    return <Badge variant="destructive">{formatted}</Badge>;
  }
  if (diffDays <= 30) {
    return <Badge variant="secondary">{formatted}</Badge>;
  }
  return <span className="tabular-nums">{formatted}</span>;
}

function ExpiringPanel() {
  const [days, setDays] = useState(30);
  const [lots, setLots] = useState<ExpiringLot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  function fetchExpiring(nextDays: number) {
    startTransition(async () => {
      const res = await fetch(`/api/stock/expiring?days=${nextDays}`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "期限間近ロットの取得に失敗しました");
        return;
      }
      const data = (await res.json()) as { lots: ExpiringLot[] };
      setLots(data.lots);
      setLoaded(true);
    });
  }

  function handleDaysChange(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
      return;
    }
    setDays(parsed);
    fetchExpiring(parsed);
  }

  useEffect(() => {
    fetchExpiring(30);
    // 初回マウント時のみ取得
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClockIcon className="size-4" />
          期限間近ロット
        </CardTitle>
        <CardDescription>指定日数以内に期限切れになるロットを表示します。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        <div className="flex items-center gap-2 px-4">
          <label htmlFor="expiring-days" className="text-sm">
            ○日以内
          </label>
          <Input
            id="expiring-days"
            type="number"
            min={0}
            step={1}
            value={days}
            onChange={(e) => handleDaysChange(e.target.value)}
            disabled={pending}
            className="w-24"
          />
        </div>

        <div className="overflow-x-auto border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">SKU</TableHead>
                <TableHead>商品名</TableHead>
                <TableHead>倉庫</TableHead>
                <TableHead>ロットコード</TableHead>
                <TableHead className="text-right">残量</TableHead>
                <TableHead>期限</TableHead>
                <TableHead className="pr-4">残日数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                    {pending && !loaded ? "読み込み中..." : "期限間近のロットはありません"}
                  </TableCell>
                </TableRow>
              ) : (
                lots.map((l) => (
                  <TableRow key={l.lot_id}>
                    <TableCell className="text-muted-foreground pl-4 font-mono text-xs">
                      {l.sku}
                    </TableCell>
                    <TableCell className="font-medium">{l.product_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{l.warehouse_name}</TableCell>
                    <TableCell className="font-mono text-xs">{l.lot_code || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num.format(l.quantity_remaining)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {dateFmt.format(new Date(`${l.expiry_date}T00:00:00`))}
                    </TableCell>
                    <TableCell className="pr-4">
                      <DaysCell days={l.days_until_expiry} />
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

function DaysCell({ days }: { days: number }) {
  if (days <= 0) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangleIcon className="size-3" />
        期限切れ
      </Badge>
    );
  }
  if (days <= 7) {
    return <Badge variant="secondary">{num.format(days)} 日</Badge>;
  }
  return <span className="tabular-nums">{num.format(days)} 日</span>;
}
