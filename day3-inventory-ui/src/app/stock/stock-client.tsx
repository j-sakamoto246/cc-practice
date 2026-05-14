"use client";

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeftIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  HistoryIcon,
  PackageCheckIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import type { StockMovementRow, Warehouse } from "@/modules/stock";

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
  initialMovements: StockMovementRow[];
};

type OperationType = "in" | "out";

const num = new Intl.NumberFormat("ja-JP");
const dateTime = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const pageSize = 10;

export function StockClient({ products, warehouses, initialStock, initialMovements }: Props) {
  const router = useRouter();
  const [stock, setStock] = useState(initialStock);
  const [movements, setMovements] = useState(initialMovements);

  async function refresh() {
    const res = await fetch("/api/stock", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as {
        stock: StockRow[];
        movements: StockMovementRow[];
      };
      setStock(data.stock);
      setMovements(data.movements);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-6 lg:grid-cols-2">
        <StockForm
          type="in"
          title="入庫登録"
          description="仕入れや返品などで増えた在庫を登録します。"
          products={products}
          warehouses={warehouses}
          stock={stock}
          onSuccess={refresh}
        />
        <StockForm
          type="out"
          title="出庫登録"
          description="出荷や調整などで減る在庫を登録します。"
          products={products}
          warehouses={warehouses}
          stock={stock}
          onSuccess={refresh}
        />
      </section>

      <HistoryTable products={products} warehouses={warehouses} movements={movements} />
    </div>
  );
}

function StockForm({
  type,
  title,
  description,
  products,
  warehouses,
  stock,
  onSuccess,
}: {
  type: OperationType;
  title: string;
  description: string;
  products: Product[];
  warehouses: Warehouse[];
  stock: StockRow[];
  onSuccess: () => void | Promise<void>;
}) {
  const [productQuery, setProductQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [memo, setMemo] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const product = useMemo(
    () => products.find((p) => productLabel(p) === productQuery) ?? null,
    [productQuery, products],
  );
  const available = product && warehouseId ? getAvailable(stock, product.id, warehouseId) : 0;
  const quantityNumber = Number(quantity);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const localErrors: Record<string, string> = {};

    if (!product) localErrors.product = "商品を選択してください";
    if (!warehouseId) localErrors.warehouse = "倉庫を選択してください";
    if (!Number.isInteger(quantityNumber) || quantityNumber <= 0) {
      localErrors.quantity = "数量は正の整数で入力してください";
    }
    if (type === "out" && product && warehouseId && quantityNumber > available) {
      localErrors.quantity = `現在庫 ${num.format(available)} を超えて出庫できません`;
    }

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          product_id: product!.id,
          warehouse_id: warehouseId,
          quantity: quantityNumber,
          memo,
          ...(type === "in"
            ? {
                lot_code: lotCode.trim() || undefined,
                expiry_date: expiryDate || undefined,
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "在庫操作に失敗しました");
        return;
      }
      toast.success(`${type === "in" ? "入庫" : "出庫"}を登録しました`);
      setQuantity("");
      setMemo("");
      setLotCode("");
      setExpiryDate("");
      await onSuccess();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {type === "in" ? (
            <ArrowDownLeftIcon className="size-4" />
          ) : (
            <ArrowUpRightIcon className="size-4" />
          )}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${type}-product`}>商品</FieldLabel>
              <Input
                id={`${type}-product`}
                list={`${type}-product-options`}
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="SKU・商品名で検索"
                disabled={pending || products.length === 0}
                required
              />
              <datalist id={`${type}-product-options`}>
                {products.map((p) => (
                  <option key={p.id} value={productLabel(p)} />
                ))}
              </datalist>
              {errors.product && <FieldError>{errors.product}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor={`${type}-warehouse`}>倉庫</FieldLabel>
              <select
                id={`${type}-warehouse`}
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
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
              {errors.warehouse && <FieldError>{errors.warehouse}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor={`${type}-quantity`}>数量</FieldLabel>
              <Input
                id={`${type}-quantity`}
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={pending}
                required
              />
              {type === "out" && product && warehouseId ? (
                <FieldDescription>現在庫: {num.format(available)}</FieldDescription>
              ) : null}
              {errors.quantity && <FieldError>{errors.quantity}</FieldError>}
            </Field>

            {type === "in" ? (
              <>
                <Field>
                  <FieldLabel htmlFor={`${type}-lot-code`}>ロットコード</FieldLabel>
                  <Input
                    id={`${type}-lot-code`}
                    value={lotCode}
                    onChange={(e) => setLotCode(e.target.value)}
                    placeholder="例: LOT-2026-04-A"
                    disabled={pending}
                  />
                  <FieldDescription>FIFO 出庫の追跡に使われます。空欄可。</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor={`${type}-expiry`}>有効期限</FieldLabel>
                  <Input
                    id={`${type}-expiry`}
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    disabled={pending}
                  />
                  <FieldDescription>期限切れアラートの対象になります。空欄可。</FieldDescription>
                </Field>
              </>
            ) : null}

            <Field>
              <FieldLabel htmlFor={`${type}-memo`}>メモ</FieldLabel>
              <textarea
                id={`${type}-memo`}
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
            <PackageCheckIcon />
            {pending ? "登録中..." : "登録"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function HistoryTable({
  products,
  warehouses,
  movements,
}: {
  products: Product[];
  warehouses: Warehouse[];
  movements: StockMovementRow[];
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [type, setType] = useState<"" | OperationType>("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      const day = m.created_at.slice(0, 10);
      return (
        (!from || day >= from) &&
        (!to || day <= to) &&
        (!productId || m.product_id === productId) &&
        (!warehouseId || m.warehouse_id === warehouseId) &&
        (!type || m.type === type)
      );
    });
  }, [from, movements, productId, to, type, warehouseId]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function resetPage() {
    setPage(1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="size-4" />
          入出庫履歴
        </CardTitle>
        <CardDescription>期間、商品、倉庫、タイプで履歴を絞り込みます。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        <div className="grid gap-3 px-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            type="date"
            aria-label="開始日"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetPage();
            }}
          />
          <Input
            type="date"
            aria-label="終了日"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetPage();
            }}
          />
          <FilterSelect
            value={productId}
            onChange={(next) => {
              setProductId(next);
              resetPage();
            }}
            label="すべての商品"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} - {p.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            value={warehouseId}
            onChange={(next) => {
              setWarehouseId(next);
              resetPage();
            }}
            label="すべての倉庫"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            value={type}
            onChange={(next) => {
              setType(next as "" | OperationType);
              resetPage();
            }}
            label="すべて"
          >
            <option value="in">入庫</option>
            <option value="out">出庫</option>
          </FilterSelect>
        </div>

        <div className="overflow-x-auto border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">日時</TableHead>
                <TableHead>商品</TableHead>
                <TableHead>倉庫</TableHead>
                <TableHead>タイプ</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="pr-4">メモ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                    入出庫履歴がありません
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground pl-4 text-xs whitespace-nowrap tabular-nums">
                      {dateTime.format(new Date(`${m.created_at}Z`))}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{m.product_name}</div>
                      <div className="text-muted-foreground font-mono text-xs">{m.sku}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{m.warehouse_name}</TableCell>
                    <TableCell>
                      {m.type === "in" ? (
                        <Badge variant="secondary" className="gap-1">
                          <ArrowDownLeftIcon className="size-3" />
                          入庫
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <ArrowUpRightIcon className="size-3" />
                          出庫
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num.format(m.quantity)}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-64 truncate pr-4">
                      {m.memo || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-muted-foreground text-sm">
            {num.format(filtered.length)} 件中{" "}
            {filtered.length === 0 ? "0" : num.format((currentPage - 1) * pageSize + 1)}-
            {num.format(Math.min(currentPage * pageSize, filtered.length))} 件
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              <ArrowLeftIcon />
              前へ
            </Button>
            <span className="text-muted-foreground min-w-16 text-center text-sm tabular-nums">
              {currentPage} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
            >
              次へ
              <ArrowRightIcon />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
    >
      <option value="">{label}</option>
      {children}
    </select>
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
