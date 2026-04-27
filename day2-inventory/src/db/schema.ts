import type { Client } from "@libsql/client";

const SCHEMA_STATEMENTS = [
  // 商品マスタ
  `CREATE TABLE IF NOT EXISTS products (
    id           TEXT PRIMARY KEY,
    sku          TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    description  TEXT DEFAULT '',
    price        REAL NOT NULL CHECK (price >= 0),
    cost         REAL NOT NULL CHECK (cost >= 0),
    min_quantity INTEGER NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`,

  // 倉庫マスタ
  `CREATE TABLE IF NOT EXISTS warehouses (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    location   TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // 在庫 (商品×倉庫で一意、キャッシュ)
  `CREATE TABLE IF NOT EXISTS inventory (
    id           TEXT PRIMARY KEY,
    product_id   TEXT NOT NULL REFERENCES products(id),
    warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
    quantity     INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(product_id, warehouse_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id)`,

  // 入出庫履歴 (追記のみ、在庫の信頼できる唯一の情報源)
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id              TEXT PRIMARY KEY,
    product_id      TEXT NOT NULL REFERENCES products(id),
    warehouse_id    TEXT NOT NULL REFERENCES warehouses(id),
    type            TEXT NOT NULL CHECK (type IN ('in', 'out')),
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    reference_type  TEXT NOT NULL DEFAULT '',
    reference_id    TEXT DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse ON stock_movements(warehouse_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at)`,

  // 受注
  `CREATE TABLE IF NOT EXISTS orders (
    id            TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
    total_amount  REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,

  // 受注明細
  `CREATE TABLE IF NOT EXISTS order_items (
    id         TEXT PRIMARY KEY,
    order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    subtotal   REAL NOT NULL CHECK (subtotal >= 0)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)`,

  // 発送
  `CREATE TABLE IF NOT EXISTS shipments (
    id              TEXT PRIMARY KEY,
    order_id        TEXT NOT NULL REFERENCES orders(id),
    tracking_number TEXT DEFAULT '',
    carrier         TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'preparing'
                    CHECK (status IN ('preparing', 'shipped', 'in_transit', 'delivered', 'returned')),
    shipped_at      TEXT,
    delivered_at    TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id)`,

  // キャンペーン
  `CREATE TABLE IF NOT EXISTS campaigns (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    discount_type  TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value REAL NOT NULL CHECK (discount_value > 0),
    start_date     TEXT NOT NULL,
    end_date       TEXT NOT NULL,
    active         INTEGER NOT NULL DEFAULT 1,
    CHECK (end_date >= start_date)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date)`,

  // 会計トランザクション (追記のみ)
  `CREATE TABLE IF NOT EXISTS transactions (
    id             TEXT PRIMARY KEY,
    type           TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'adjustment', 'refund')),
    amount         REAL NOT NULL,
    reference_type TEXT NOT NULL DEFAULT '',
    reference_id   TEXT DEFAULT '',
    description    TEXT DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at)`,
];

export async function runMigrations(client: Client): Promise<void> {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute("PRAGMA journal_mode = WAL");

  for (const sql of SCHEMA_STATEMENTS) {
    await client.execute(sql);
  }
}
