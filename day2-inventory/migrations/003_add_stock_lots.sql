-- +migrate Up

CREATE TABLE stock_lots (
  id                 TEXT PRIMARY KEY,
  product_id         TEXT NOT NULL REFERENCES products(id),
  warehouse_id       TEXT NOT NULL REFERENCES warehouses(id),
  lot_code           TEXT NOT NULL DEFAULT '',
  quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
  expiry_date        TEXT,
  received_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_stock_lots_fifo
  ON stock_lots(product_id, warehouse_id, expiry_date, received_at)
  WHERE quantity_remaining > 0;
CREATE INDEX idx_stock_lots_expiry
  ON stock_lots(expiry_date) WHERE quantity_remaining > 0;

ALTER TABLE stock_movements ADD COLUMN lot_id TEXT REFERENCES stock_lots(id);
CREATE INDEX idx_stock_movements_lot ON stock_movements(lot_id);

INSERT INTO stock_lots (id, product_id, warehouse_id, lot_code, quantity_remaining, expiry_date, received_at)
SELECT lower(hex(randomblob(16))), product_id, warehouse_id, 'INITIAL', quantity, NULL, datetime('now')
FROM inventory
WHERE quantity > 0;

-- +migrate Down

DROP INDEX idx_stock_movements_lot;
ALTER TABLE stock_movements DROP COLUMN lot_id;
DROP INDEX idx_stock_lots_expiry;
DROP INDEX idx_stock_lots_fifo;
DROP TABLE stock_lots;
