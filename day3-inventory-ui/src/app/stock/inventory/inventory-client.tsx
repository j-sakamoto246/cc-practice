"use client";

import { useMemo, useState } from "react";
import { AlertTriangleIcon, BoxesIcon, CheckCircle2Icon } from "lucide-react";

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
import type { Product } from "@/modules/product";
import type { Warehouse } from "@/modules/stock";

type StockRow = {
  product_id: string;
  sku: string;
  product_name: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
};

type InventoryRow = StockRow & { min_quantity: number };

type Props = {
  products: Product[];
  warehouses: Warehouse[];
  stock: StockRow[];
};

const num = new Intl.NumberFormat("ja-JP");

export function InventoryClient({ products, warehouses, stock }: Props) {
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState("");

  const minBySku = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) map.set(p.sku, p.min_quantity);
    return map;
  }, [products]);

  const rows: InventoryRow[] = useMemo(
    () =>
      stock.map((s) => ({
        ...s,
        min_quantity: minBySku.get(s.sku) ?? 0,
      })),
    [stock, minBySku],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQuery =
        !q || r.sku.toLowerCase().includes(q) || r.product_name.toLowerCase().includes(q);
      const matchesWarehouse = !warehouseId || r.warehouse_id === warehouseId;
      return matchesQuery && matchesWarehouse;
    });
  }, [rows, query, warehouseId]);

  const lowCount = useMemo(
    () => filtered.filter((r) => r.min_quantity > 0 && r.quantity < r.min_quantity).length,
    [filtered],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BoxesIcon className="size-4" />
          在庫一覧
        </CardTitle>
        <CardDescription>商品 × 倉庫ごとの現在庫と最低在庫の状態を表示します。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        <div className="grid gap-3 px-4 sm:grid-cols-2 lg:grid-cols-[1fr_minmax(0,16rem)]">
          <Input
            placeholder="SKU・商品名で絞り込み"
            aria-label="SKU・商品名で絞り込み"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            aria-label="倉庫で絞り込み"
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
          >
            <option value="">すべての倉庫</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 px-4 text-sm">
          <span>
            現在 <span className="text-foreground tabular-nums">{num.format(filtered.length)}</span>{" "}
            件
          </span>
          <span>
            要発注 <span className="text-foreground tabular-nums">{num.format(lowCount)}</span> 件
          </span>
        </div>

        <div className="overflow-x-auto border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">SKU</TableHead>
                <TableHead>商品名</TableHead>
                <TableHead>倉庫</TableHead>
                <TableHead className="text-right">現在庫</TableHead>
                <TableHead className="text-right">最低在庫</TableHead>
                <TableHead className="pr-4">状態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                    {rows.length === 0 ? "在庫データがありません" : "該当する在庫がありません"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const low = r.min_quantity > 0 && r.quantity < r.min_quantity;
                  return (
                    <TableRow key={`${r.product_id}-${r.warehouse_id}`}>
                      <TableCell className="text-muted-foreground pl-4 font-mono text-xs">
                        {r.sku}
                      </TableCell>
                      <TableCell className="font-medium">{r.product_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.warehouse_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num.format(r.quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num.format(r.min_quantity)}
                      </TableCell>
                      <TableCell className="pr-4">
                        {low ? (
                          <Badge variant="outline" className="gap-1">
                            <AlertTriangleIcon className="size-3" />
                            要発注
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2Icon className="size-3" />
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
