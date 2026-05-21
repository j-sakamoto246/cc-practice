import { memo } from "react";
import { PackageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { OrderDetail } from "@/modules/order";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type DraftItem = {
  key: string;
  product_id: string;
  quantity: string;
};

export const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
export const num = new Intl.NumberFormat("ja-JP");
export const dateTime = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export const statusLabels: Record<OrderStatus, string> = {
  pending: "未確定",
  confirmed: "確定",
  processing: "処理中",
  shipped: "発送済み",
  delivered: "配達完了",
  cancelled: "キャンセル",
};

export const statusVariants: Record<OrderStatus, "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  confirmed: "secondary",
  processing: "secondary",
  shipped: "secondary",
  delivered: "outline",
  cancelled: "destructive",
};

export const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const safeStatus = (status in statusLabels ? status : "pending") as OrderStatus;
  return (
    <Badge variant={statusVariants[safeStatus]} className="gap-1">
      <PackageIcon className="size-3" />
      {statusLabels[safeStatus]}
    </Badge>
  );
});

export function Info({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-muted-foreground mb-1 text-xs">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

export function nextStatuses(status: string): OrderStatus[] {
  switch (status) {
    case "pending":
      return ["confirmed", "cancelled"];
    case "confirmed":
      return ["processing", "cancelled"];
    case "processing":
      return ["shipped", "cancelled"];
    case "shipped":
      return ["delivered"];
    default:
      return [];
  }
}

export function canOpenShipment(order: OrderDetail) {
  return (
    order.status === "confirmed" || order.status === "processing" || order.status === "shipped"
  );
}

export function shortId(id: string) {
  return id.slice(0, 8);
}

export function newDraftItem(): DraftItem {
  return { key: crypto.randomUUID(), product_id: "", quantity: "1" };
}
