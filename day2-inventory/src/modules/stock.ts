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

export interface StockTransferInput {
  product_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  quantity: number;
  reference_type?: string;
  reference_id?: string;
}

export interface StockTransferResult {
  out: StockMovement;
  in: StockMovement;
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

export async function stockTransfer(input: StockTransferInput): Promise<StockTransferResult> {
  const client = getClient();

  if (input.quantity <= 0) {
    throw new Error("移動数量は1以上を指定してください");
  }

  if (input.from_warehouse_id === input.to_warehouse_id) {
    throw new Error("移動元と移動先には異なる倉庫を指定してください");
  }

  const current = await getStockStatus(input.product_id, input.from_warehouse_id);
  if (current.quantity < input.quantity) {
    throw new InsufficientStockError(current.quantity, input.quantity);
  }

  const transferId = input.reference_id || generateId();
  const outMovementId = generateId();
  const inMovementId = generateId();
  const toInventoryId = generateId();
  const referenceType = input.reference_type ?? "transfer";

  await client.batch([
    {
      sql: `INSERT INTO stock_movements (id, product_id, warehouse_id, type, quantity, reference_type, reference_id)
            VALUES (?, ?, ?, 'out', ?, ?, ?)`,
      args: [
        outMovementId,
        input.product_id,
        input.from_warehouse_id,
        input.quantity,
        referenceType,
        transferId,
      ],
    },
    {
      sql: `UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now')
            WHERE product_id = ? AND warehouse_id = ?`,
      args: [input.quantity, input.product_id, input.from_warehouse_id],
    },
    {
      sql: `INSERT INTO stock_movements (id, product_id, warehouse_id, type, quantity, reference_type, reference_id)
            VALUES (?, ?, ?, 'in', ?, ?, ?)`,
      args: [
        inMovementId,
        input.product_id,
        input.to_warehouse_id,
        input.quantity,
        referenceType,
        transferId,
      ],
    },
    {
      sql: `INSERT INTO inventory (id, product_id, warehouse_id, quantity)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(product_id, warehouse_id)
            DO UPDATE SET quantity = quantity + ?, updated_at = datetime('now')`,
      args: [
        toInventoryId,
        input.product_id,
        input.to_warehouse_id,
        input.quantity,
        input.quantity,
      ],
    },
  ]);

  logger.info(
    `在庫移動しました: product=${input.product_id}, from=${input.from_warehouse_id}, to=${input.to_warehouse_id}, quantity=${input.quantity}`,
  );

  const result = await client.execute({
    sql: "SELECT * FROM stock_movements WHERE id IN (?, ?)",
    args: [outMovementId, inMovementId],
  });
  const movements = result.rows.map((row) => rowToMovement(row));
  const out = movements.find((movement) => movement.id === outMovementId)!;
  const inbound = movements.find((movement) => movement.id === inMovementId)!;

  return { out, in: inbound };
}

export async function getWarehouseByName(name: string) {
  const client = getClient();
  const result = await client.execute({
    sql: "SELECT * FROM warehouses WHERE name = ?",
    args: [name],
  });
  const row = result.rows[0];
  if (!row) return null;
  return { id: row["id"] as string, name: row["name"] as string, location: row["location"] as string };
}

export async function getAllStock() {
  const client = getClient();
  const result = await client.execute(
    `SELECT i.product_id, p.sku, p.name as product_name, i.warehouse_id, w.name as warehouse_name, i.quantity
     FROM inventory i
     JOIN products p ON p.id = i.product_id
     JOIN warehouses w ON w.id = i.warehouse_id
     WHERE i.quantity > 0
     ORDER BY p.sku, w.name`,
  );
  return result.rows.map((row) => ({
    product_id: row["product_id"] as string,
    sku: row["sku"] as string,
    product_name: row["product_name"] as string,
    warehouse_id: row["warehouse_id"] as string,
    warehouse_name: row["warehouse_name"] as string,
    quantity: row["quantity"] as number,
  }));
}

export interface StockAlert {
  product_id: string;
  sku: string;
  product_name: string;
  total_quantity: number;
  min_quantity: number;
}

export async function getStockAlerts(): Promise<StockAlert[]> {
  const client = getClient();

  const result = await client.execute(
    `SELECT p.id AS product_id, p.sku, p.name AS product_name, p.min_quantity,
            COALESCE(SUM(i.quantity), 0) AS total_quantity
     FROM products p
     LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.min_quantity > 0
     GROUP BY p.id, p.sku, p.name, p.min_quantity
     HAVING COALESCE(SUM(i.quantity), 0) <= p.min_quantity
     ORDER BY p.sku`,
  );

  return result.rows.map((row) => ({
    product_id: row["product_id"] as string,
    sku: row["sku"] as string,
    product_name: row["product_name"] as string,
    total_quantity: Number(row["total_quantity"]),
    min_quantity: row["min_quantity"] as number,
  }));
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
