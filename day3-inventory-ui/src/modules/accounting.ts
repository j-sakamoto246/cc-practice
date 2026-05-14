import { getClient } from "../db/client";
import { generateId } from "../utils/id";
import { logger } from "../utils/logger";

export interface Transaction {
  id: string;
  type: "sale" | "purchase" | "refund" | "adjustment";
  amount: number;
  reference_type: string;
  reference_id: string;
  description: string;
  created_at: string;
}

export interface RecordTransactionInput {
  type: "sale" | "purchase" | "refund" | "adjustment";
  amount: number;
  reference_type?: string;
  reference_id?: string;
  description?: string;
}

export interface SalesReportItem {
  date: string;
  total_sales: number;
  transaction_count: number;
}

export interface ProductSalesItem {
  product_id: string;
  product_name: string;
  total_quantity: number;
  total_sales: number;
}

export interface SalesReport {
  start_date: string;
  end_date: string;
  by_date: SalesReportItem[];
  by_product: ProductSalesItem[];
  grand_total: number;
}

export interface InventoryValueItem {
  product_id: string;
  product_name: string;
  sku: string;
  cost: number;
  total_quantity: number;
  total_value: number;
}

export interface InventoryValuation {
  items: InventoryValueItem[];
  total_value: number;
}

const VALID_TYPES = ["sale", "purchase", "refund", "adjustment"] as const;

export async function recordTransaction(input: RecordTransactionInput): Promise<Transaction> {
  const client = getClient();

  if (!VALID_TYPES.includes(input.type)) {
    throw new Error(`無効な取引タイプです: ${input.type}`);
  }

  if (input.amount === 0) {
    throw new Error("金額は0以外を指定してください");
  }

  const id = generateId();

  await client.execute({
    sql: `INSERT INTO transactions (id, type, amount, reference_type, reference_id, description)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.type,
      input.amount,
      input.reference_type ?? "",
      input.reference_id ?? "",
      input.description ?? "",
    ],
  });

  logger.info(`取引を記録しました: ${input.type} ${input.amount} (${id})`);

  const result = await client.execute({
    sql: "SELECT * FROM transactions WHERE id = ?",
    args: [id],
  });
  return rowToTransaction(result.rows[0]!);
}

export async function generateSalesReport(
  startDate: string,
  endDate: string,
): Promise<SalesReport> {
  const client = getClient();

  if (endDate < startDate) {
    throw new Error("終了日は開始日以降を指定してください");
  }

  // 日別集計
  const byDateResult = await client.execute({
    sql: `SELECT
            date(created_at) as date,
            SUM(amount) as total_sales,
            COUNT(*) as transaction_count
          FROM transactions
          WHERE type = 'sale'
            AND date(created_at) >= ? AND date(created_at) <= ?
          GROUP BY date(created_at)
          ORDER BY date(created_at)`,
    args: [startDate, endDate],
  });

  const byDate: SalesReportItem[] = byDateResult.rows.map((row) => ({
    date: row["date"] as string,
    total_sales: row["total_sales"] as number,
    transaction_count: row["transaction_count"] as number,
  }));

  // 商品別集計 (reference_type='order' の取引を order_items 経由で集計)
  const byProductResult = await client.execute({
    sql: `SELECT
            oi.product_id,
            p.name as product_name,
            SUM(oi.quantity) as total_quantity,
            SUM(oi.subtotal) as total_sales
          FROM transactions t
          JOIN order_items oi ON oi.order_id = t.reference_id
          JOIN products p ON p.id = oi.product_id
          WHERE t.type = 'sale'
            AND t.reference_type = 'order'
            AND date(t.created_at) >= ? AND date(t.created_at) <= ?
          GROUP BY oi.product_id, p.name
          ORDER BY total_sales DESC`,
    args: [startDate, endDate],
  });

  const byProduct: ProductSalesItem[] = byProductResult.rows.map((row) => ({
    product_id: row["product_id"] as string,
    product_name: row["product_name"] as string,
    total_quantity: row["total_quantity"] as number,
    total_sales: row["total_sales"] as number,
  }));

  const grandTotal = byDate.reduce((sum, item) => sum + item.total_sales, 0);

  logger.info(`売上レポートを生成しました: ${startDate} 〜 ${endDate} (合計: ${grandTotal})`);

  return {
    start_date: startDate,
    end_date: endDate,
    by_date: byDate,
    by_product: byProduct,
    grand_total: grandTotal,
  };
}

export async function calculateInventoryValue(): Promise<InventoryValuation> {
  const client = getClient();

  const result = await client.execute(
    `SELECT
       i.product_id,
       p.name as product_name,
       p.sku,
       p.cost,
       SUM(i.quantity) as total_quantity,
       SUM(i.quantity * p.cost) as total_value
     FROM inventory i
     JOIN products p ON p.id = i.product_id
     WHERE i.quantity > 0
     GROUP BY i.product_id, p.name, p.sku, p.cost
     ORDER BY total_value DESC`,
  );

  const items: InventoryValueItem[] = result.rows.map((row) => ({
    product_id: row["product_id"] as string,
    product_name: row["product_name"] as string,
    sku: row["sku"] as string,
    cost: row["cost"] as number,
    total_quantity: row["total_quantity"] as number,
    total_value: row["total_value"] as number,
  }));

  const totalValue = items.reduce((sum, item) => sum + item.total_value, 0);

  logger.info(`在庫評価を算出しました: 総額=${totalValue}`);

  return { items, total_value: totalValue };
}

export function exportToCSV(headers: string[], rows: (string | number)[][]): string {
  const escapeCsvField = (field: string | number): string => {
    const str = String(field);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => row.map(escapeCsvField).join(",")),
  ];

  return lines.join("\n");
}

function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: row["id"] as string,
    type: row["type"] as Transaction["type"],
    amount: row["amount"] as number,
    reference_type: row["reference_type"] as string,
    reference_id: row["reference_id"] as string,
    description: row["description"] as string,
    created_at: row["created_at"] as string,
  };
}
