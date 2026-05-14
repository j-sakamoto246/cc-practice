import { getClient } from "../db/client";

export interface DashboardSummary {
  total_products: number;
  total_quantity: number;
  inventory_value: number;
}

export interface RecentMovement {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  type: "in" | "out";
  quantity: number;
  created_at: string;
}

export interface SalesChartPoint {
  date: string;
  total: number;
  order_count: number;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const client = getClient();

  const result = await client.execute(
    `SELECT
       (SELECT COUNT(*) FROM products) AS total_products,
       COALESCE((SELECT SUM(quantity) FROM inventory), 0) AS total_quantity,
       COALESCE((
         SELECT SUM(i.quantity * p.cost)
         FROM inventory i
         JOIN products p ON p.id = i.product_id
       ), 0) AS inventory_value`,
  );

  const row = result.rows[0]!;
  return {
    total_products: Number(row["total_products"]),
    total_quantity: Number(row["total_quantity"]),
    inventory_value: Number(row["inventory_value"]),
  };
}

export async function getRecentMovements(limit = 10): Promise<RecentMovement[]> {
  const client = getClient();

  const result = await client.execute({
    sql: `SELECT m.id, m.product_id, m.type, m.quantity, m.created_at,
                 p.sku, p.name AS product_name
          FROM stock_movements m
          JOIN products p ON p.id = m.product_id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT ?`,
    args: [limit],
  });

  return result.rows.map((row) => ({
    id: row["id"] as string,
    product_id: row["product_id"] as string,
    product_name: row["product_name"] as string,
    sku: row["sku"] as string,
    type: row["type"] as "in" | "out",
    quantity: Number(row["quantity"]),
    created_at: row["created_at"] as string,
  }));
}

export async function getSalesChart(days = 7): Promise<SalesChartPoint[]> {
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error("days は 1 以上の整数を指定してください");
  }
  const client = getClient();

  const result = await client.execute({
    sql: `SELECT date(created_at) AS date,
                 COALESCE(SUM(total_amount), 0) AS total,
                 COUNT(*) AS order_count
          FROM orders
          WHERE status != 'cancelled'
            AND date(created_at) >= date('now', ?)
          GROUP BY date(created_at)
          ORDER BY date(created_at) ASC`,
    args: [`-${days - 1} days`],
  });

  const map = new Map<string, { total: number; order_count: number }>();
  for (const row of result.rows) {
    map.set(row["date"] as string, {
      total: Number(row["total"]),
      order_count: Number(row["order_count"]),
    });
  }

  const points: SalesChartPoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const hit = map.get(key);
    points.push({
      date: key,
      total: hit?.total ?? 0,
      order_count: hit?.order_count ?? 0,
    });
  }
  return points;
}
