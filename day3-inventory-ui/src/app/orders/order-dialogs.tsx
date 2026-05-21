"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { ArrowUpRightIcon, PlusIcon, SendIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OrderDetail } from "@/modules/order";
import type { Product } from "@/modules/product";

import {
  Info,
  StatusBadge,
  canOpenShipment,
  dateTime,
  newDraftItem,
  nextStatuses,
  num,
  shortId,
  statusLabels,
  yen,
  type DraftItem,
} from "./orders-shared";

export function CreateOrderDialog({
  open,
  onOpenChange,
  products,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  onSuccess: () => void | Promise<void>;
}) {
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState<DraftItem[]>([newDraftItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const total = useMemo(
    () =>
      items.reduce((sum, item) => {
        const product = products.find((p) => p.id === item.product_id);
        const quantity = Number(item.quantity);
        return (
          sum +
          (product && Number.isInteger(quantity) && quantity > 0 ? product.price * quantity : 0)
        );
      }, 0),
    [items, products],
  );

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function removeItem(key: string) {
    setItems((current) =>
      current.length === 1 ? current : current.filter((item) => item.key !== key),
    );
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const localErrors: Record<string, string> = {};
    if (!customerName.trim()) localErrors.customer = "顧客名を入力してください";

    const payloadItems = items
      .filter((item) => item.product_id)
      .map((item) => {
        const product = products.find((p) => p.id === item.product_id);
        return {
          product_id: item.product_id,
          quantity: Number(item.quantity),
          unit_price: product?.price ?? 0,
        };
      });

    if (payloadItems.length === 0) {
      localErrors.items = "商品を1件以上選択してください";
    }
    if (payloadItems.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      localErrors.items = "数量は正の整数で入力してください";
    }

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_name: customerName.trim(), items: payloadItems }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "受注の作成に失敗しました");
        return;
      }
      toast.success("受注を作成しました");
      setCustomerName("");
      setItems([newDraftItem()]);
      onOpenChange(false);
      await onSuccess();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>新規受注</DialogTitle>
          <DialogDescription>顧客名と商品明細を入力します。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="order-customer">顧客名</FieldLabel>
              <Input
                id="order-customer"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={pending}
                required
              />
              {errors.customer && <FieldError>{errors.customer}</FieldError>}
            </Field>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <FieldLabel>商品</FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setItems((current) => [...current, newDraftItem()])}
                  disabled={pending}
                >
                  <PlusIcon />
                  明細を追加
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((item, index) => {
                  const product = products.find((p) => p.id === item.product_id);
                  const quantity = Number(item.quantity);
                  const subtotal =
                    product && Number.isInteger(quantity) && quantity > 0
                      ? product.price * quantity
                      : 0;
                  return (
                    <div
                      key={item.key}
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_120px_32px]"
                    >
                      <select
                        value={item.product_id}
                        onChange={(e) => updateItem(item.key, { product_id: e.target.value })}
                        disabled={pending}
                        aria-label={`商品 ${index + 1}`}
                        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
                      >
                        <option value="">商品を選択</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} - {p.name}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                        disabled={pending}
                        aria-label={`数量 ${index + 1}`}
                      />
                      <div className="text-muted-foreground flex h-8 items-center justify-end text-sm tabular-nums">
                        {yen.format(subtotal)}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeItem(item.key)}
                        disabled={pending || items.length === 1}
                        aria-label="明細を削除"
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  );
                })}
              </div>
              {errors.items && <FieldError>{errors.items}</FieldError>}
            </div>
          </FieldGroup>
          <div className="flex justify-end border-t pt-3 text-sm">
            <span className="text-muted-foreground mr-3">合計</span>
            <span className="text-lg font-semibold tabular-nums">{yen.format(total)}</span>
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={pending}>
                  キャンセル
                </Button>
              }
            />
            <Button type="submit" disabled={pending || products.length === 0}>
              {pending ? "作成中..." : "作成"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OrderDetailDialog({
  order,
  onClose,
  onSuccess,
  onShip,
}: {
  order: OrderDetail | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  onShip: (order: OrderDetail) => void;
}) {
  const [pending, startTransition] = useTransition();

  function changeStatus(status: string) {
    if (!order || !status) return;
    startTransition(async () => {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "ステータス変更に失敗しました");
        return;
      }
      toast.success("ステータスを変更しました");
      await onSuccess();
    });
  }

  return (
    <Dialog open={order !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>受注詳細</DialogTitle>
          <DialogDescription>
            {order ? `${order.customer_name} / ${shortId(order.id)}` : ""}
          </DialogDescription>
        </DialogHeader>
        {order ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Info label="ステータス" value={<StatusBadge status={order.status} />} />
              <Info label="明細数" value={`${num.format(order.items.length)} 件`} />
              <Info label="合計金額" value={yen.format(order.total_amount)} />
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">単価</TableHead>
                    <TableHead className="text-right">小計</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.product_name}</div>
                        <div className="text-muted-foreground font-mono text-xs">{item.sku}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num.format(item.quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {yen.format(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {yen.format(item.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {order.shipments.length > 0 ? (
              <div className="rounded-lg border p-3 text-sm">
                <div className="mb-2 font-medium">発送情報</div>
                {order.shipments.map((shipment) => (
                  <div
                    key={shipment.id}
                    className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1"
                  >
                    <span>{shipment.carrier}</span>
                    <span className="font-mono">{shipment.tracking_number}</span>
                    <span>
                      {shipment.shipped_at
                        ? dateTime.format(new Date(`${shipment.shipped_at}Z`))
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <select
                value=""
                onChange={(e) => changeStatus(e.target.value)}
                disabled={pending || nextStatuses(order.status).length === 0}
                aria-label="ステータス変更"
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 disabled:opacity-50"
              >
                <option value="">ステータス変更</option>
                {nextStatuses(order.status).map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                onClick={() => onShip(order)}
                disabled={!canOpenShipment(order)}
              >
                <SendIcon />
                発送処理
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ShipmentDialog({
  order,
  onClose,
  onSuccess,
}: {
  order: OrderDetail | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [carrier, setCarrier] = useState("ヤマト運輸");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!order) return;

    const localErrors: Record<string, string> = {};
    if (!carrier) localErrors.carrier = "配送業者を選択してください";
    if (!trackingNumber.trim()) localErrors.tracking = "追跡番号を入力してください";
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await fetch(`/api/orders/${order.id}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier, tracking_number: trackingNumber.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "発送処理に失敗しました");
        return;
      }
      toast.success("発送処理を登録しました");
      setTrackingNumber("");
      onClose();
      await onSuccess();
    });
  }

  return (
    <Dialog open={order !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>発送処理</DialogTitle>
          <DialogDescription>
            {order ? `${order.customer_name} の受注を発送します。` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="shipment-carrier">配送業者</FieldLabel>
              <select
                id="shipment-carrier"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                disabled={pending}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
              >
                <option value="ヤマト運輸">ヤマト運輸</option>
                <option value="佐川急便">佐川急便</option>
                <option value="日本郵便">日本郵便</option>
                <option value="西濃運輸">西濃運輸</option>
              </select>
              {errors.carrier && <FieldError>{errors.carrier}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="tracking-number">追跡番号</FieldLabel>
              <Input
                id="tracking-number"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                disabled={pending}
                required
              />
              {errors.tracking && <FieldError>{errors.tracking}</FieldError>}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={pending}>
                  キャンセル
                </Button>
              }
            />
            <Button type="submit" disabled={pending || !order}>
              <ArrowUpRightIcon />
              {pending ? "処理中..." : "発送登録"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
