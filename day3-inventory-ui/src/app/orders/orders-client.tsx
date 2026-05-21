"use client";

import { memo, useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { EyeIcon, PlusIcon, SendIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
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

import { StatusBadge, canOpenShipment, dateTime, num, shortId, yen } from "./orders-shared";

const CreateOrderDialog = dynamic(() => import("./order-dialogs").then((m) => m.CreateOrderDialog));
const OrderDetailDialog = dynamic(() => import("./order-dialogs").then((m) => m.OrderDetailDialog));
const ShipmentDialog = dynamic(() => import("./order-dialogs").then((m) => m.ShipmentDialog));

type Props = {
  initialOrders: OrderDetail[];
  products: Product[];
};

type FilterStatus = "" | "pending" | "confirmed" | "shipped" | "delivered";

export function OrdersClient({ initialOrders, products }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [status, setStatus] = useState<FilterStatus>("");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createMounted, setCreateMounted] = useState(false);
  const [detailTarget, setDetailTarget] = useState<OrderDetail | null>(null);
  const [detailMounted, setDetailMounted] = useState(false);
  const [shipTarget, setShipTarget] = useState<OrderDetail | null>(null);
  const [shipMounted, setShipMounted] = useState(false);

  const openCreate = useCallback(() => {
    setCreateMounted(true);
    setCreateOpen(true);
  }, []);
  const openDetail = useCallback((order: OrderDetail) => {
    setDetailMounted(true);
    setDetailTarget(order);
  }, []);
  const openShip = useCallback((order: OrderDetail) => {
    setShipMounted(true);
    setShipTarget(order);
  }, []);
  const closeDetail = useCallback(() => setDetailTarget(null), []);
  const closeShip = useCallback(() => setShipTarget(null), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(
      (order) =>
        (!status || order.status === status) &&
        (!q || order.customer_name.toLowerCase().includes(q)),
    );
  }, [orders, query, status]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/orders", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { orders: OrderDetail[] };
      setOrders(data.orders);
      setDetailTarget((current) =>
        current ? (data.orders.find((order) => order.id === current.id) ?? null) : null,
      );
      setShipTarget((current) =>
        current ? (data.orders.find((order) => order.id === current.id) ?? null) : null,
      );
    }
    router.refresh();
  }, [router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-[180px_minmax(240px,360px)]">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as FilterStatus)}
            aria-label="ステータスで絞り込み"
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
          >
            <option value="">すべてのステータス</option>
            <option value="pending">pending</option>
            <option value="confirmed">confirmed</option>
            <option value="shipped">shipped</option>
            <option value="delivered">delivered</option>
          </select>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="顧客名で検索"
            aria-label="顧客名で検索"
          />
        </div>
        <Button onClick={openCreate}>
          <PlusIcon />
          新規受注
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">受注</TableHead>
              <TableHead>顧客名</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead className="text-right">明細数</TableHead>
              <TableHead className="text-right">合計金額</TableHead>
              <TableHead>作成日時</TableHead>
              <TableHead className="pr-4 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                  受注がありません
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((order) => (
                <OrderRow key={order.id} order={order} onDetail={openDetail} onShip={openShip} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {createMounted && (
        <CreateOrderDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          products={products}
          onSuccess={refresh}
        />
      )}
      {detailMounted && (
        <OrderDetailDialog
          order={detailTarget}
          onClose={closeDetail}
          onSuccess={refresh}
          onShip={openShip}
        />
      )}
      {shipMounted && <ShipmentDialog order={shipTarget} onClose={closeShip} onSuccess={refresh} />}
    </div>
  );
}

const OrderRow = memo(function OrderRow({
  order,
  onDetail,
  onShip,
}: {
  order: OrderDetail;
  onDetail: (order: OrderDetail) => void;
  onShip: (order: OrderDetail) => void;
}) {
  return (
    <TableRow>
      <TableCell className="pl-4 font-mono text-xs">{shortId(order.id)}</TableCell>
      <TableCell className="font-medium">{order.customer_name}</TableCell>
      <TableCell>
        <StatusBadge status={order.status} />
      </TableCell>
      <TableCell className="text-right tabular-nums">{num.format(order.items.length)}</TableCell>
      <TableCell className="text-right tabular-nums">{yen.format(order.total_amount)}</TableCell>
      <TableCell className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
        {dateTime.format(new Date(`${order.created_at}Z`))}
      </TableCell>
      <TableCell className="pr-4 text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDetail(order)}
            aria-label="受注詳細"
          >
            <EyeIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onShip(order)}
            disabled={!canOpenShipment(order)}
            aria-label="発送処理"
          >
            <SendIcon />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});
