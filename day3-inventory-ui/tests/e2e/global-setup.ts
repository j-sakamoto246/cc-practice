import { createClient } from "@libsql/client";
import { rm } from "node:fs/promises";
import path from "node:path";

import { migrateUp } from "../../src/db/migrator";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const E2E_DB_PATH = path.join(PROJECT_ROOT, "data/e2e.db");
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, "migrations");

const NOW = "2026-04-28 12:00:00";

const products: [string, string, string, string, number, number, number, number][] = [
  ["prd-coffee-001", "CF-001", "コーヒー豆 1kg", "業務用ブレンド", 1800, 980, 20, 5],
  ["prd-filter-002", "FL-002", "ペーパーフィルター 100枚", "円すい型", 650, 260, 40, 3],
  ["prd-cup-003", "CP-003", "テイクアウトカップ 50個", "12oz", 1200, 520, 30, 4],
  ["prd-syrup-004", "SY-004", "バニラシロップ", "750ml", 1450, 700, 12, 7],
];

const warehouses: [string, string, string][] = [
  ["wh-tokyo", "東京倉庫", "東京都江東区"],
  ["wh-osaka", "大阪倉庫", "大阪市住之江区"],
];

const lots: [string, string, string, string, number, string | null, string][] = [
  [
    "lot-coffee-tokyo-a",
    "prd-coffee-001",
    "wh-tokyo",
    "CF-TK-2404",
    72,
    "2026-10-31",
    "2026-04-10 09:00:00",
  ],
  [
    "lot-filter-tokyo-a",
    "prd-filter-002",
    "wh-tokyo",
    "FL-TK-2404",
    180,
    null,
    "2026-04-08 10:00:00",
  ],
  ["lot-cup-tokyo-a", "prd-cup-003", "wh-tokyo", "CP-TK-2404", 95, null, "2026-04-11 11:00:00"],
  [
    "lot-syrup-osaka-a",
    "prd-syrup-004",
    "wh-osaka",
    "SY-OS-2404",
    34,
    "2027-01-31",
    "2026-04-09 09:30:00",
  ],
];

async function resetDbFiles() {
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    await rm(`${E2E_DB_PATH}${suffix}`, { force: true });
  }
}

export default async function globalSetup() {
  await resetDbFiles();

  const client = createClient({ url: `file:${E2E_DB_PATH}` });
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute("PRAGMA journal_mode = WAL");

  await migrateUp(client, { dir: MIGRATIONS_DIR });

  await client.batch(
    products.map((p) => ({
      sql: `INSERT OR IGNORE INTO products
            (id, sku, name, description, price, cost, min_quantity, lead_time_days, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [...p, NOW, NOW],
    })),
  );

  await client.batch(
    warehouses.map((w) => ({
      sql: "INSERT OR IGNORE INTO warehouses (id, name, location, created_at) VALUES (?, ?, ?, ?)",
      args: [...w, NOW],
    })),
  );

  await client.batch(
    lots.map((lot) => ({
      sql: `INSERT OR IGNORE INTO stock_lots
            (id, product_id, warehouse_id, lot_code, quantity_remaining, expiry_date, received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: lot,
    })),
  );

  await client.batch(
    lots.map((lot) => ({
      sql: `INSERT INTO inventory (id, product_id, warehouse_id, quantity)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(product_id, warehouse_id)
            DO UPDATE SET quantity = excluded.quantity, updated_at = datetime('now')`,
      args: [`inv-${lot[0]}`, lot[1], lot[2], lot[4]],
    })),
  );

  client.close();
}
