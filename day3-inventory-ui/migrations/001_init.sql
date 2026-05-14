-- +migrate Up

CREATE TABLE products (
  id           TEXT PRIMARY KEY,
  sku          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT DEFAULT '',
  price        REAL NOT NULL CHECK (price >= 0),
  cost         REAL NOT NULL CHECK (cost >= 0),
  min_quantity INTEGER NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_products_sku ON products(sku);

CREATE TABLE warehouses (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  location   TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE inventory (
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  quantity     INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, warehouse_id)
);
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_warehouse ON inventory(warehouse_id);

CREATE TABLE stock_movements (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES products(id),
  warehouse_id    TEXT NOT NULL REFERENCES warehouses(id),
  type            TEXT NOT NULL CHECK (type IN ('in', 'out')),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  reference_type  TEXT NOT NULL DEFAULT '',
  reference_id    TEXT DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_warehouse ON stock_movements(warehouse_id);
CREATE INDEX idx_stock_movements_created ON stock_movements(created_at);

CREATE TABLE orders (
  id            TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  total_amount  REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_items (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  subtotal   REAL NOT NULL CHECK (subtotal >= 0)
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE shipments (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id),
  tracking_number TEXT DEFAULT '',
  carrier         TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'preparing'
                  CHECK (status IN ('preparing', 'shipped', 'in_transit', 'delivered', 'returned')),
  shipped_at      TEXT,
  delivered_at    TEXT
);
CREATE INDEX idx_shipments_order ON shipments(order_id);

CREATE TABLE campaigns (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  discount_type  TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value REAL NOT NULL CHECK (discount_value > 0),
  start_date     TEXT NOT NULL,
  end_date       TEXT NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1,
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_campaigns_dates ON campaigns(start_date, end_date);

CREATE TABLE transactions (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'adjustment', 'refund')),
  amount         REAL NOT NULL,
  reference_type TEXT NOT NULL DEFAULT '',
  reference_id   TEXT DEFAULT '',
  description    TEXT DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_created ON transactions(created_at);

-- +migrate Down

DROP TABLE transactions;
DROP TABLE campaigns;
DROP TABLE shipments;
DROP TABLE order_items;
DROP TABLE orders;
DROP TABLE stock_movements;
DROP TABLE inventory;
DROP TABLE warehouses;
DROP TABLE products;
