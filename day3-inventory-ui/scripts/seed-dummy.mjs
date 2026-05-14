import { createClient } from "@libsql/client";
import { mkdir } from "node:fs/promises";

const dbUrl = process.env.DATABASE_URL || `file:${process.cwd()}/data/inventory.db`;
const client = createClient({ url: dbUrl });

const now = "2026-04-28 12:00:00";

const products = [
  ["prd-coffee-001", "CF-001", "コーヒー豆 1kg", "業務用ブレンド", 1800, 980, 20, 5],
  ["prd-filter-002", "FL-002", "ペーパーフィルター 100枚", "円すい型", 650, 260, 40, 3],
  ["prd-cup-003", "CP-003", "テイクアウトカップ 50個", "12oz", 1200, 520, 30, 4],
  ["prd-syrup-004", "SY-004", "バニラシロップ", "750ml", 1450, 700, 12, 7],
  ["prd-tea-005", "TE-005", "紅茶ティーバッグ 100包", "アールグレイ", 2200, 1100, 10, 6],
  ["prd-milk-006", "MK-006", "常温ミルク 1L", "ケース販売", 380, 210, 50, 2],
];

const warehouses = [
  ["wh-tokyo", "東京倉庫", "東京都江東区"],
  ["wh-osaka", "大阪倉庫", "大阪市住之江区"],
  ["wh-fukuoka", "福岡倉庫", "福岡市東区"],
];

const lots = [
  ["lot-coffee-tokyo-a", "prd-coffee-001", "wh-tokyo", "CF-TK-2404", 72, "2026-10-31", "2026-04-10 09:00:00"],
  ["lot-filter-tokyo-a", "prd-filter-002", "wh-tokyo", "FL-TK-2404", 180, null, "2026-04-08 10:00:00"],
  ["lot-cup-tokyo-a", "prd-cup-003", "wh-tokyo", "CP-TK-2404", 95, null, "2026-04-11 11:00:00"],
  ["lot-syrup-osaka-a", "prd-syrup-004", "wh-osaka", "SY-OS-2404", 34, "2027-01-31", "2026-04-09 09:30:00"],
  ["lot-tea-osaka-a", "prd-tea-005", "wh-osaka", "TE-OS-2404", 28, "2027-02-28", "2026-04-12 08:30:00"],
  ["lot-milk-fukuoka-a", "prd-milk-006", "wh-fukuoka", "MK-FK-2404", 160, "2026-08-31", "2026-04-07 14:00:00"],
  ["lot-coffee-fukuoka-a", "prd-coffee-001", "wh-fukuoka", "CF-FK-2404", 18, "2026-09-30", "2026-04-15 13:00:00"],
];

const movements = [
  ["mov-in-coffee-tokyo", "prd-coffee-001", "wh-tokyo", "in", 80, "lot-coffee-tokyo-a", "manual", "初期入庫", "2026-04-10 09:05:00"],
  ["mov-out-coffee-tokyo", "prd-coffee-001", "wh-tokyo", "out", 8, "lot-coffee-tokyo-a", "manual", "店舗補充", "2026-04-20 15:20:00"],
  ["mov-in-filter-tokyo", "prd-filter-002", "wh-tokyo", "in", 180, "lot-filter-tokyo-a", "manual", "定期仕入れ", "2026-04-08 10:05:00"],
  ["mov-in-cup-tokyo", "prd-cup-003", "wh-tokyo", "in", 120, "lot-cup-tokyo-a", "manual", "月初仕入れ", "2026-04-11 11:05:00"],
  ["mov-out-cup-tokyo", "prd-cup-003", "wh-tokyo", "out", 25, "lot-cup-tokyo-a", "manual", "EC出荷", "2026-04-22 16:10:00"],
  ["mov-in-syrup-osaka", "prd-syrup-004", "wh-osaka", "in", 34, "lot-syrup-osaka-a", "manual", "キャンペーン用", "2026-04-09 09:35:00"],
  ["mov-in-tea-osaka", "prd-tea-005", "wh-osaka", "in", 28, "lot-tea-osaka-a", "manual", "新規取扱", "2026-04-12 08:35:00"],
  ["mov-in-milk-fukuoka", "prd-milk-006", "wh-fukuoka", "in", 160, "lot-milk-fukuoka-a", "manual", "定期仕入れ", "2026-04-07 14:05:00"],
  ["mov-in-coffee-fukuoka", "prd-coffee-001", "wh-fukuoka", "in", 18, "lot-coffee-fukuoka-a", "manual", "安全在庫", "2026-04-15 13:05:00"],
];

const orders = [
  ["ord-001", "株式会社サンプルカフェ", "pending", 6850, "2026-04-24 10:30:00", "2026-04-24 10:30:00"],
  ["ord-002", "青山ベーカリー", "confirmed", 5800, "2026-04-23 13:20:00", "2026-04-23 16:00:00"],
  ["ord-003", "北浜ホテル", "shipped", 13200, "2026-04-21 09:10:00", "2026-04-22 11:45:00"],
  ["ord-004", "天神オフィスサービス", "delivered", 7600, "2026-04-18 14:40:00", "2026-04-20 17:30:00"],
];

const orderItems = [
  ["oi-001-1", "ord-001", "prd-coffee-001", 2, 1800, 3600],
  ["oi-001-2", "ord-001", "prd-filter-002", 5, 650, 3250],
  ["oi-002-1", "ord-002", "prd-syrup-004", 4, 1450, 5800],
  ["oi-003-1", "ord-003", "prd-tea-005", 6, 2200, 13200],
  ["oi-004-1", "ord-004", "prd-cup-003", 4, 1200, 4800],
  ["oi-004-2", "ord-004", "prd-milk-006", 4, 380, 1520],
  ["oi-004-3", "ord-004", "prd-filter-002", 2, 650, 1300],
];

const shipments = [
  ["shp-003", "ord-003", "YMT-20260422-003", "ヤマト運輸", "shipped", "2026-04-22 11:45:00", null],
  ["shp-004", "ord-004", "JP-20260419-004", "日本郵便", "delivered", "2026-04-19 10:20:00", "2026-04-20 17:30:00"],
];

await mkdir("data", { recursive: true });
await client.execute("PRAGMA foreign_keys = ON");

await client.batch(
  products.map((p) => ({
    sql: `INSERT OR IGNORE INTO products
          (id, sku, name, description, price, cost, min_quantity, lead_time_days, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [...p, now, now],
  })),
);

await client.batch(
  warehouses.map((w) => ({
    sql: "INSERT OR IGNORE INTO warehouses (id, name, location, created_at) VALUES (?, ?, ?, ?)",
    args: [...w, now],
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

await client.batch(
  movements.map((m) => ({
    sql: `INSERT OR IGNORE INTO stock_movements
          (id, product_id, warehouse_id, type, quantity, lot_id, reference_type, reference_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: m,
  })),
);

await client.batch(
  orders.map((o) => ({
    sql: `INSERT OR IGNORE INTO orders
          (id, customer_name, status, total_amount, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: o,
  })),
);

await client.batch(
  orderItems.map((item) => ({
    sql: `INSERT OR IGNORE INTO order_items
          (id, order_id, product_id, quantity, unit_price, subtotal)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: item,
  })),
);

await client.batch(
  shipments.map((s) => ({
    sql: `INSERT OR IGNORE INTO shipments
          (id, order_id, tracking_number, carrier, status, shipped_at, delivered_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: s,
  })),
);

const counts = await Promise.all(
  ["products", "warehouses", "inventory", "stock_movements", "orders", "order_items", "shipments"].map(
    async (table) => {
      const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
      return [table, Number(result.rows[0].count)];
    },
  ),
);

for (const [table, count] of counts) {
  console.log(`${table}: ${count}`);
}

client.close();
