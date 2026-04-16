import { getClient } from "../db/client.js";
import { InsufficientStockError } from "../errors/insufficient-stock.js";
import { generateId } from "../utils/id.js";
import { logger } from "../utils/logger.js";

export interface StockMovement {
  id: string;
  product_id: string;
  warehouse_id: string;
  type: "in" | "out";
  quantity: number;
  reference_type: string;
  reference_id: string;
  created_at: string;
}

export interface StockStatus {
  product_id: string;
  warehouse_id: string;
  quantity: number;
}

export interface StockInInput {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  reference_type?: string;
  reference_id?: string;
}

export interface StockOutInput {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  reference_type?: string;
  reference_id?: string;
}

export async function stockIn(input: StockInInput): Promise<StockMovement> {
  const client = getClient();

  if (input.quantity <= 0) {
    throw new Error("入庫数量は1以上を指定してください");
  }

  const movementId = generateId();
  const inventoryId = generateId();

  await client.batch([
    {
      sql: `INSERT INTO stock_movements (id, product_id, warehouse_id, type, quantity, reference_type, reference_id)
            VALUES (?, ?, ?, 'in', ?, ?, ?)`,
      args: [
        movementId,
        input.product_id,
        input.warehouse_id,
        input.quantity,
        input.reference_type ?? "",
        input.reference_id ?? "",
      ],
    },
    {
      sql: `INSERT INTO inventory (id, product_id, warehouse_id, quantity)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(product_id, warehouse_id)
            DO UPDATE SET quantity = quantity + ?, updated_at = datetime('now')`,
      args: [
        inventoryId,
        input.product_id,
        input.warehouse_id,
        input.quantity,
        input.quantity,
      ],
    },
  ]);

  logger.info(
    `入庫しました: product=${input.product_id}, warehouse=${input.warehouse_id}, quantity=${input.quantity}`,
  );

  const result = await client.execute({
    sql: "SELECT * FROM stock_movements WHERE id = ?",
    args: [movementId],
  });
  return rowToMovement(result.rows[0]!);
}

export async function stockOut(input: StockOutInput): Promise<StockMovement> {
  const client = getClient();

  if (input.quantity <= 0) {
    throw new Error("出庫数量は1以上を指定してください");
  }

  // 現在庫を確認
  const current = await getStockStatus(input.product_id, input.warehouse_id);
  if (current.quantity < input.quantity) {
    throw new InsufficientStockError(current.quantity, input.quantity);
  }

  const movementId = generateId();

  await client.batch([
    {
      sql: `INSERT INTO stock_movements (id, product_id, warehouse_id, type, quantity, reference_type, reference_id)
            VALUES (?, ?, ?, 'out', ?, ?, ?)`,
      args: [
        movementId,
        input.product_id,
        input.warehouse_id,
        input.quantity,
        input.reference_type ?? "",
        input.reference_id ?? "",
      ],
    },
    {
      sql: `UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now')
            WHERE product_id = ? AND warehouse_id = ?`,
      args: [input.quantity, input.product_id, input.warehouse_id],
    },
  ]);

  logger.info(
    `出庫しました: product=${input.product_id}, warehouse=${input.warehouse_id}, quantity=${input.quantity}`,
  );

  const result = await client.execute({
    sql: "SELECT * FROM stock_movements WHERE id = ?",
    args: [movementId],
  });
  return rowToMovement(result.rows[0]!);
}

export async function getStockStatus(
  productId: string,
  warehouseId: string,
): Promise<StockStatus> {
  const client = getClient();

  const result = await client.execute({
    sql: "SELECT * FROM inventory WHERE product_id = ? AND warehouse_id = ?",
    args: [productId, warehouseId],
  });

  const row = result.rows[0];
  if (!row) {
    return { product_id: productId, warehouse_id: warehouseId, quantity: 0 };
  }

  return {
    product_id: row["product_id"] as string,
    warehouse_id: row["warehouse_id"] as string,
    quantity: row["quantity"] as number,
  };
}

function rowToMovement(row: Record<string, unknown>): StockMovement {
  return {
    id: row["id"] as string,
    product_id: row["product_id"] as string,
    warehouse_id: row["warehouse_id"] as string,
    type: row["type"] as "in" | "out",
    quantity: row["quantity"] as number,
    reference_type: row["reference_type"] as string,
    reference_id: row["reference_id"] as string,
    created_at: row["created_at"] as string,
  };
}
