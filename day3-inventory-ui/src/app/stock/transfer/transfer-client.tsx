"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeftIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

type Props = {
  products: Product[];
  warehouses: Warehouse[];
  initialStock: StockRow[];
};

const num = new Intl.NumberFormat("ja-JP");

export function TransferClient({ products, warehouses, initialStock }: Props) {
  const router = useRouter();
  const [productQuery, setProductQuery] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const product = useMemo(
    () => products.find((p) => productLabel(p) === productQuery) ?? null,
    [productQuery, products],
  );
  const available =
    product && fromWarehouseId ? getAvailable(initialStock, product.id, fromWarehouseId) : 0;
  const quantityNumber = Number(quantity);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const localErrors: Record<string, string> = {};

    if (!product) localErrors.product = "商品を選択してください";
    if (!fromWarehouseId) localErrors.fromWarehouse = "移動元倉庫を選択してください";
    if (!toWarehouseId) localErrors.toWarehouse = "移動先倉庫を選択してください";
    if (fromWarehouseId && toWarehouseId && fromWarehouseId === toWarehouseId) {
      localErrors.toWarehouse = "移動元と移動先には異なる倉庫を指定してください";
    }
    if (!Number.isInteger(quantityNumber) || quantityNumber <= 0) {
      localErrors.quantity = "数量は正の整数で入力してください";
    } else if (product && fromWarehouseId && quantityNumber > available) {
      localErrors.quantity = `現在庫 ${num.format(available)} を超えて移動できません`;
    }

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await fetch("/api/stock/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product!.id,
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          quantity: quantityNumber,
          memo,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "倉庫間移動に失敗しました");
        return;
      }
      toast.success("倉庫間移動を登録しました");
      setQuantity("");
      setMemo("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeftIcon className="size-4" />
          倉庫間移動
        </CardTitle>
        <CardDescription>FIFO で引き当てたロットを移動先倉庫へ転送します。</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="transfer-product">商品</FieldLabel>
              <Input
                id="transfer-product"
                list="transfer-product-options"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="SKU・商品名で検索"
                disabled={pending || products.length === 0}
                required
              />
              <datalist id="transfer-product-options">
                {products.map((p) => (
                  <option key={p.id} value={productLabel(p)} />
                ))}
              </datalist>
              {errors.product && <FieldError>{errors.product}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="transfer-from">移動元倉庫</FieldLabel>
              <select
                id="transfer-from"
                value={fromWarehouseId}
                onChange={(e) => setFromWarehouseId(e.target.value)}
                disabled={pending || warehouses.length === 0}
                required
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">倉庫を選択</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.location ? `（${w.location}）` : ""}
                  </option>
                ))}
              </select>
              {product && fromWarehouseId ? (
                <FieldDescription>現在庫: {num.format(available)}</FieldDescription>
              ) : null}
              {errors.fromWarehouse && <FieldError>{errors.fromWarehouse}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="transfer-to">移動先倉庫</FieldLabel>
              <select
                id="transfer-to"
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
                disabled={pending || warehouses.length === 0}
                required
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">倉庫を選択</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.location ? `（${w.location}）` : ""}
                  </option>
                ))}
              </select>
              {errors.toWarehouse && <FieldError>{errors.toWarehouse}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="transfer-quantity">数量</FieldLabel>
              <Input
                id="transfer-quantity"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={pending}
                required
              />
              {errors.quantity && <FieldError>{errors.quantity}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="transfer-memo">メモ</FieldLabel>
              <textarea
                id="transfer-memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                disabled={pending}
                rows={3}
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </Field>
          </FieldGroup>

          <Button
            type="submit"
            disabled={pending || products.length === 0 || warehouses.length === 0}
          >
            <ArrowRightLeftIcon />
            {pending ? "登録中..." : "登録"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function productLabel(product: Product) {
  return `${product.sku} - ${product.name}`;
}

function getAvailable(stock: StockRow[], productId: string, warehouseId: string) {
  return (
    stock.find((s) => s.product_id === productId && s.warehouse_id === warehouseId)?.quantity ?? 0
  );
}
