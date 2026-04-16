import { getClient } from "../db/client.js";
import { generateId } from "../utils/id.js";
import { logger } from "../utils/logger.js";

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

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface CreateOrderItemInput {
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface CreateOrderInput {
  customer_name: string;
  items: CreateOrderItemInput[];
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

export async function createOrder(
  input: CreateOrderInput,
): Promise<OrderWithItems> {
  const client = getClient();

  if (input.items.length === 0) {
    throw new Error("受注には1つ以上の明細が必要です");
  }

  const orderId = generateId();
  const items: { id: string; product_id: string; quantity: number; unit_price: number; subtotal: number }[] = [];
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

  const result = await client.execute(
    "SELECT * FROM orders ORDER BY created_at DESC",
  );

  logger.info(`受注一覧を取得しました (${result.rows.length}件)`);

  return result.rows.map(rowToOrder);
}

export async function updateOrderStatus(
  id: string,
  newStatus: string,
): Promise<Order> {
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
    throw new Error(
      `ステータスを ${existing.status} から ${newStatus} に変更できません`,
    );
  }

  await client.execute({
    sql: "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?",
    args: [newStatus, id],
  });

  logger.info(`受注ステータスを更新しました: ${id} (${existing.status} → ${newStatus})`);

  return (await getOrderById(id))! as Order;
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
    sql: "SELECT * FROM order_items WHERE order_id = ?",
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

function rowToOrderItem(row: Record<string, unknown>): OrderItem {
  return {
    id: row["id"] as string,
    order_id: row["order_id"] as string,
    product_id: row["product_id"] as string,
    quantity: row["quantity"] as number,
    unit_price: row["unit_price"] as number,
    subtotal: row["subtotal"] as number,
  };
}
