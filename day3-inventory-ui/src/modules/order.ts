import { getClient } from "../db/client";
import { InsufficientStockError } from "../errors/insufficient-stock";
import { getStockStatus } from "./stock";
import { generateId } from "../utils/id";
import { logger } from "../utils/logger";

export interface Order {
  id: string;
  customer_name: string;
  status: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface OrderItemDetail extends OrderItem {
  sku: string;
  product_name: string;
}

export interface OrderWithItems extends Order {
  items: OrderItemDetail[];
}

export interface CreateOrderItemInput {
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface CreateOrderInput {
  customer_name: string;
  items: CreateOrderItemInput[];
  warehouse_id?: string;
}

const VALID_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export async function createOrder(input: CreateOrderInput): Promise<OrderWithItems> {
  const client = getClient();

  if (input.items.length === 0) {
    throw new Error("受注には1つ以上の明細が必要です");
  }

  // warehouse_id が指定されている場合は在庫チェック
  if (input.warehouse_id) {
    for (const item of input.items) {
      const status = await getStockStatus(item.product_id, input.warehouse_id);
      if (status.quantity < item.quantity) {
        throw new InsufficientStockError(status.quantity, item.quantity);
      }
    }
  }

  const orderId = generateId();
  const items: {
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }[] = [];
  let totalAmount = 0;

  for (const item of input.items) {
    const subtotal = item.quantity * item.unit_price;
    totalAmount += subtotal;
    items.push({
      id: generateId(),
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal,
    });
  }

  await client.batch([
    {
      sql: `INSERT INTO orders (id, customer_name, total_amount)
            VALUES (?, ?, ?)`,
      args: [orderId, input.customer_name, totalAmount],
    },
    ...items.map((item) => ({
      sql: `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [item.id, orderId, item.product_id, item.quantity, item.unit_price, item.subtotal],
    })),
  ]);

  logger.info(`受注を作成しました: ${orderId} (顧客: ${input.customer_name})`);

  return (await getOrderById(orderId))!;
}

export async function listOrders(): Promise<Order[]> {
  const client = getClient();

  const result = await client.execute("SELECT * FROM orders ORDER BY created_at DESC");

  logger.info(`受注一覧を取得しました (${result.rows.length}件)`);

  return result.rows.map(rowToOrder);
}

export async function listOrderDetails(): Promise<OrderDetail[]> {
  const orders = await listOrders();
  const details = await Promise.all(orders.map((order) => getOrderDetail(order.id)));
  return details.filter((detail): detail is OrderDetail => detail !== null);
}

export async function updateOrderStatus(id: string, newStatus: string): Promise<Order> {
  const client = getClient();

  const existing = await getOrderById(id);
  if (!existing) {
    throw new Error(`受注が見つかりません: ${id}`);
  }

  if (!VALID_STATUSES.includes(newStatus as (typeof VALID_STATUSES)[number])) {
    throw new Error(`無効なステータスです: ${newStatus}`);
  }

  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(`ステータスを ${existing.status} から ${newStatus} に変更できません`);
  }

  await client.execute({
    sql: "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?",
    args: [newStatus, id],
  });

  logger.info(`受注ステータスを更新しました: ${id} (${existing.status} → ${newStatus})`);

  return (await getOrderById(id))! as Order;
}

export interface Shipment {
  id: string;
  order_id: string;
  tracking_number: string;
  carrier: string;
  status: string;
  shipped_at: string | null;
  delivered_at: string | null;
}

export interface OrderDetail extends Omit<OrderWithItems, "items"> {
  items: OrderItemDetail[];
  shipments: Shipment[];
}

export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  const order = await getOrderById(id);
  if (!order) return null;

  const client = getClient();
  const shipmentsResult = await client.execute({
    sql: "SELECT * FROM shipments WHERE order_id = ?",
    args: [id],
  });

  const shipments: Shipment[] = shipmentsResult.rows.map((row) => ({
    id: row["id"] as string,
    order_id: row["order_id"] as string,
    tracking_number: (row["tracking_number"] as string | null) ?? "",
    carrier: row["carrier"] as string,
    status: row["status"] as string,
    shipped_at: (row["shipped_at"] as string | null) ?? null,
    delivered_at: (row["delivered_at"] as string | null) ?? null,
  }));

  return { ...order, shipments };
}

export async function shipOrder(
  orderId: string,
  carrier: string,
  trackingNumber: string,
): Promise<Shipment> {
  const client = getClient();

  const existing = await getOrderById(orderId);
  if (!existing) {
    throw new Error(`受注が見つかりません: ${orderId}`);
  }
  if (existing.status === "pending") {
    throw new Error("発送前に受注を confirmed に変更してください");
  }
  if (existing.status === "confirmed") {
    await updateOrderStatus(orderId, "processing");
    await updateOrderStatus(orderId, "shipped");
  } else if (existing.status === "processing") {
    await updateOrderStatus(orderId, "shipped");
  } else if (existing.status !== "shipped") {
    throw new Error(`ステータス ${existing.status} の受注は発送できません`);
  }

  const shipmentId = generateId();
  await client.execute({
    sql: `INSERT INTO shipments (id, order_id, tracking_number, carrier, status, shipped_at)
          VALUES (?, ?, ?, ?, 'shipped', datetime('now'))`,
    args: [shipmentId, orderId, trackingNumber, carrier],
  });

  logger.info(`出荷しました: order=${orderId}, carrier=${carrier}, tracking=${trackingNumber}`);

  const result = await client.execute({
    sql: "SELECT * FROM shipments WHERE id = ?",
    args: [shipmentId],
  });
  const row = result.rows[0]!;
  return {
    id: row["id"] as string,
    order_id: row["order_id"] as string,
    tracking_number: (row["tracking_number"] as string | null) ?? "",
    carrier: row["carrier"] as string,
    status: row["status"] as string,
    shipped_at: (row["shipped_at"] as string | null) ?? null,
    delivered_at: (row["delivered_at"] as string | null) ?? null,
  };
}

async function getOrderById(id: string): Promise<OrderWithItems | null> {
  const client = getClient();

  const orderResult = await client.execute({
    sql: "SELECT * FROM orders WHERE id = ?",
    args: [id],
  });

  const row = orderResult.rows[0];
  if (!row) return null;

  const itemsResult = await client.execute({
    sql: `SELECT oi.*, p.sku, p.name AS product_name
          FROM order_items oi
          JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = ?
          ORDER BY oi.id`,
    args: [id],
  });

  return {
    ...rowToOrder(row),
    items: itemsResult.rows.map(rowToOrderItem),
  };
}

function rowToOrder(row: Record<string, unknown>): Order {
  return {
    id: row["id"] as string,
    customer_name: row["customer_name"] as string,
    status: row["status"] as string,
    total_amount: row["total_amount"] as number,
    created_at: row["created_at"] as string,
    updated_at: row["updated_at"] as string,
  };
}

function rowToOrderItem(row: Record<string, unknown>): OrderItemDetail {
  return {
    id: row["id"] as string,
    order_id: row["order_id"] as string,
    product_id: row["product_id"] as string,
    quantity: row["quantity"] as number,
    unit_price: row["unit_price"] as number,
    subtotal: row["subtotal"] as number,
    sku: (row["sku"] as string | undefined) ?? "",
    product_name: (row["product_name"] as string | undefined) ?? "",
  };
}
