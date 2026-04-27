import type { InValue } from "@libsql/client";
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
  lot_id: string | null;
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
  lot_code?: string;
  expiry_date?: string;
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

export interface StockLot {
  id: string;
  product_id: string;
  warehouse_id: string;
  lot_code: string;
  quantity_remaining: number;
  expiry_date: string | null;
  received_at: string;
}

export interface LotAllocation {
  lot_id: string;
  lot_code: string;
  expiry_date: string | null;
  consume: number;
}

export async function stockIn(input: StockInInput): Promise<StockMovement> {
  const client = getClient();

  if (input.quantity <= 0) {
    throw new Error("入庫数量は1以上を指定してください");
  }

  const lotId = generateId();
  const movementId = generateId();
  const inventoryId = generateId();
  const lotCode = input.lot_code ?? "";
  const expiryDate: InValue = input.expiry_date ?? null;
  const receivedAt = new Date().toISOString();

  await client.batch([
    {
      sql: `INSERT INTO stock_lots (id, product_id, warehouse_id, lot_code, quantity_remaining, expiry_date, received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [lotId, input.product_id, input.warehouse_id, lotCode, input.quantity, expiryDate, receivedAt],
    },
    {
      sql: `INSERT INTO stock_movements (id, product_id, warehouse_id, type, quantity, lot_id, reference_type, reference_id)
            VALUES (?, ?, ?, 'in', ?, ?, ?, ?)`,
      args: [
        movementId,
        input.product_id,
        input.warehouse_id,
        input.quantity,
        lotId,
        input.reference_type ?? "",
        input.reference_id ?? "",
      ],
    },
    {
      sql: `INSERT INTO inventory (id, product_id, warehouse_id, quantity)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(product_id, warehouse_id)
            DO UPDATE SET quantity = quantity + ?, updated_at = datetime('now')`,
      args: [inventoryId, input.product_id, input.warehouse_id, input.quantity, input.quantity],
    },
  ]);

  logger.info(
    `入庫しました: product=${input.product_id}, warehouse=${input.warehouse_id}, quantity=${input.quantity}, lot=${lotCode || "(no-code)"}, expiry=${input.expiry_date ?? "-"}`,
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

  const allocations = await selectFifoLots(input.product_id, input.warehouse_id, input.quantity);

  const movementIds: string[] = [];
  const statements = [];
  const referenceType = input.reference_type ?? "";
  const referenceId = input.reference_id ?? "";

  for (const alloc of allocations) {
    const movementId = generateId();
    movementIds.push(movementId);
    statements.push({
      sql: `UPDATE stock_lots SET quantity_remaining = quantity_remaining - ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: [alloc.consume, alloc.lot_id] as InValue[],
    });
    statements.push({
      sql: `INSERT INTO stock_movements (id, product_id, warehouse_id, type, quantity, lot_id, reference_type, reference_id)
            VALUES (?, ?, ?, 'out', ?, ?, ?, ?)`,
      args: [
        movementId,
        input.product_id,
        input.warehouse_id,
        alloc.consume,
        alloc.lot_id,
        referenceType,
        referenceId,
      ] as InValue[],
    });
  }
  statements.push({
    sql: `UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now')
          WHERE product_id = ? AND warehouse_id = ?`,
    args: [input.quantity, input.product_id, input.warehouse_id] as InValue[],
  });

  await client.batch(statements);

  logger.info(
    `出庫しました: product=${input.product_id}, warehouse=${input.warehouse_id}, quantity=${input.quantity}, lots=${allocations.length}`,
  );

  const firstId = movementIds[0]!;
  const result = await client.execute({
    sql: "SELECT * FROM stock_movements WHERE id = ?",
    args: [firstId],
  });
  const first = rowToMovement(result.rows[0]!);
  return {
    ...first,
    quantity: input.quantity,
    lot_id: allocations.length === 1 ? allocations[0]!.lot_id : null,
  };
}

export async function stockTransfer(input: StockTransferInput): Promise<StockTransferResult> {
  const client = getClient();

  if (input.quantity <= 0) {
    throw new Error("移動数量は1以上を指定してください");
  }

  if (input.from_warehouse_id === input.to_warehouse_id) {
    throw new Error("移動元と移動先には異なる倉庫を指定してください");
  }

  const allocations = await selectFifoLots(input.product_id, input.from_warehouse_id, input.quantity);

  const transferId = input.reference_id || generateId();
  const referenceType = input.reference_type ?? "transfer";
  const toInventoryId = generateId();

  const outMovementIds: string[] = [];
  const inMovementIds: string[] = [];
  const statements: { sql: string; args: InValue[] }[] = [];

  for (const alloc of allocations) {
    const outMovementId = generateId();
    const inMovementId = generateId();
    const newLotId = generateId();
    outMovementIds.push(outMovementId);
    inMovementIds.push(inMovementId);

    // 移動元: ロット減算 → out 履歴
    statements.push({
      sql: `UPDATE stock_lots SET quantity_remaining = quantity_remaining - ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: [alloc.consume, alloc.lot_id],
    });
    statements.push({
      sql: `INSERT INTO stock_movements (id, product_id, warehouse_id, type, quantity, lot_id, reference_type, reference_id)
            VALUES (?, ?, ?, 'out', ?, ?, ?, ?)`,
      args: [
        outMovementId,
        input.product_id,
        input.from_warehouse_id,
        alloc.consume,
        alloc.lot_id,
        referenceType,
        transferId,
      ],
    });

    // 移動先: 期限を引き継いだ新規ロット → in 履歴
    statements.push({
      sql: `INSERT INTO stock_lots (id, product_id, warehouse_id, lot_code, quantity_remaining, expiry_date, received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        newLotId,
        input.product_id,
        input.to_warehouse_id,
        alloc.lot_code,
        alloc.consume,
        alloc.expiry_date,
        new Date().toISOString(),
      ],
    });
    statements.push({
      sql: `INSERT INTO stock_movements (id, product_id, warehouse_id, type, quantity, lot_id, reference_type, reference_id)
            VALUES (?, ?, ?, 'in', ?, ?, ?, ?)`,
      args: [
        inMovementId,
        input.product_id,
        input.to_warehouse_id,
        alloc.consume,
        newLotId,
        referenceType,
        transferId,
      ],
    });
  }

  statements.push({
    sql: `UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now')
          WHERE product_id = ? AND warehouse_id = ?`,
    args: [input.quantity, input.product_id, input.from_warehouse_id],
  });
  statements.push({
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
  });

  await client.batch(statements);

  logger.info(
    `在庫移動しました: product=${input.product_id}, from=${input.from_warehouse_id}, to=${input.to_warehouse_id}, quantity=${input.quantity}, lots=${allocations.length}`,
  );

  const outFirst = await fetchMovement(outMovementIds[0]!);
  const inFirst = await fetchMovement(inMovementIds[0]!);
  return {
    out: { ...outFirst, quantity: input.quantity, lot_id: allocations.length === 1 ? outFirst.lot_id : null },
    in: { ...inFirst, quantity: input.quantity, lot_id: allocations.length === 1 ? inFirst.lot_id : null },
  };
}

async function selectFifoLots(
  productId: string,
  warehouseId: string,
  qty: number,
): Promise<LotAllocation[]> {
  const client = getClient();
  const result = await client.execute({
    sql: `SELECT id, lot_code, expiry_date, quantity_remaining
          FROM stock_lots
          WHERE product_id = ? AND warehouse_id = ? AND quantity_remaining > 0
          ORDER BY (expiry_date IS NULL), expiry_date ASC, received_at ASC, id ASC`,
    args: [productId, warehouseId],
  });

  const allocations: LotAllocation[] = [];
  let remaining = qty;
  for (const row of result.rows) {
    if (remaining <= 0) break;
    const available = Number(row["quantity_remaining"]);
    const consume = Math.min(remaining, available);
    allocations.push({
      lot_id: row["id"] as string,
      lot_code: row["lot_code"] as string,
      expiry_date: (row["expiry_date"] as string | null) ?? null,
      consume,
    });
    remaining -= consume;
  }

  if (remaining > 0) {
    const total = qty - remaining;
    throw new InsufficientStockError(total, qty);
  }
  return allocations;
}

async function fetchMovement(id: string): Promise<StockMovement> {
  const client = getClient();
  const result = await client.execute({
    sql: "SELECT * FROM stock_movements WHERE id = ?",
    args: [id],
  });
  return rowToMovement(result.rows[0]!);
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

export interface ListLotsFilter {
  product_id?: string;
  warehouse_id?: string;
  include_empty?: boolean;
}

export interface StockLotRow extends StockLot {
  sku: string;
  product_name: string;
  warehouse_name: string;
}

export async function listLots(filter: ListLotsFilter = {}): Promise<StockLotRow[]> {
  const client = getClient();
  const where: string[] = [];
  const args: InValue[] = [];
  if (filter.product_id) {
    where.push("l.product_id = ?");
    args.push(filter.product_id);
  }
  if (filter.warehouse_id) {
    where.push("l.warehouse_id = ?");
    args.push(filter.warehouse_id);
  }
  if (!filter.include_empty) {
    where.push("l.quantity_remaining > 0");
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const result = await client.execute({
    sql: `SELECT l.*, p.sku, p.name AS product_name, w.name AS warehouse_name
          FROM stock_lots l
          JOIN products p ON p.id = l.product_id
          JOIN warehouses w ON w.id = l.warehouse_id
          ${whereClause}
          ORDER BY (l.expiry_date IS NULL), l.expiry_date ASC, l.received_at ASC`,
    args,
  });

  return result.rows.map((row) => ({
    id: row["id"] as string,
    product_id: row["product_id"] as string,
    warehouse_id: row["warehouse_id"] as string,
    lot_code: row["lot_code"] as string,
    quantity_remaining: Number(row["quantity_remaining"]),
    expiry_date: (row["expiry_date"] as string | null) ?? null,
    received_at: row["received_at"] as string,
    sku: row["sku"] as string,
    product_name: row["product_name"] as string,
    warehouse_name: row["warehouse_name"] as string,
  }));
}

export interface ExpiringLot {
  lot_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  warehouse_id: string;
  warehouse_name: string;
  lot_code: string;
  quantity_remaining: number;
  expiry_date: string;
  days_until_expiry: number;
}

export async function getExpiringLots(daysAhead = 30): Promise<ExpiringLot[]> {
  if (!Number.isFinite(daysAhead) || daysAhead < 0) {
    throw new Error("daysAhead は 0 以上の数値を指定してください");
  }
  const client = getClient();
  const result = await client.execute({
    sql: `SELECT l.id AS lot_id, l.product_id, p.sku, p.name AS product_name,
                 l.warehouse_id, w.name AS warehouse_name, l.lot_code,
                 l.quantity_remaining, l.expiry_date,
                 CAST(julianday(date(l.expiry_date)) - julianday(date('now')) AS INTEGER) AS days_until_expiry
          FROM stock_lots l
          JOIN products p ON p.id = l.product_id
          JOIN warehouses w ON w.id = l.warehouse_id
          WHERE l.expiry_date IS NOT NULL
            AND l.quantity_remaining > 0
            AND date(l.expiry_date) <= date('now', ?)
          ORDER BY l.expiry_date ASC, l.received_at ASC`,
    args: [`+${daysAhead} days`],
  });

  return result.rows.map((row) => ({
    lot_id: row["lot_id"] as string,
    product_id: row["product_id"] as string,
    sku: row["sku"] as string,
    product_name: row["product_name"] as string,
    warehouse_id: row["warehouse_id"] as string,
    warehouse_name: row["warehouse_name"] as string,
    lot_code: row["lot_code"] as string,
    quantity_remaining: Number(row["quantity_remaining"]),
    expiry_date: row["expiry_date"] as string,
    days_until_expiry: Number(row["days_until_expiry"]),
  }));
}

function rowToMovement(row: Record<string, unknown>): StockMovement {
  return {
    id: row["id"] as string,
    product_id: row["product_id"] as string,
    warehouse_id: row["warehouse_id"] as string,
    type: row["type"] as "in" | "out",
    quantity: row["quantity"] as number,
    lot_id: (row["lot_id"] as string | null) ?? null,
    reference_type: row["reference_type"] as string,
    reference_id: row["reference_id"] as string,
    created_at: row["created_at"] as string,
  };
}
