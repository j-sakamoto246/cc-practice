import { describe, expect, it, beforeEach } from "vitest";
import { getClient } from "../../src/db/client.js";
import {
  getStockStatus,
  listLots,
  stockIn,
  stockOut,
  stockTransfer,
} from "../../src/modules/stock.js";

async function seedMasterData() {
  const client = getClient();
  await client.batch([
    {
      sql: "INSERT INTO products (id, sku, name, price, cost) VALUES (?, ?, ?, ?, ?)",
      args: ["prod-tx", "TX-001", "トランザクション検証商品", 1000, 500],
    },
    {
      sql: "INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)",
      args: ["wh-a", "倉庫A", "東京"],
    },
    {
      sql: "INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)",
      args: ["wh-b", "倉庫B", "大阪"],
    },
    {
      sql: "INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)",
      args: ["wh-c", "倉庫C", "名古屋"],
    },
  ]);
}

async function countTransferMovements(referenceId: string) {
  const client = getClient();
  const result = await client.execute({
    sql: "SELECT COUNT(*) AS count FROM stock_movements WHERE reference_id = ?",
    args: [referenceId],
  });
  return Number(result.rows[0]!["count"]);
}

describe("stockTransfer transaction safety", () => {
  beforeEach(async () => {
    await seedMasterData();
  });

  it("移動途中でエラーが起きた場合、移動元の出庫と履歴がロールバックされる", async () => {
    await stockIn({ product_id: "prod-tx", warehouse_id: "wh-a", quantity: 10 });
    const beforeFrom = await getStockStatus("prod-tx", "wh-a");
    const beforeTo = await getStockStatus("prod-tx", "wh-b");

    await expect(
      stockTransfer({
        product_id: "prod-tx",
        from_warehouse_id: "wh-a",
        to_warehouse_id: "missing-warehouse",
        quantity: 4,
        reference_id: "tx-fail-midway",
      }),
    ).rejects.toThrow();

    await expect(getStockStatus("prod-tx", "wh-a")).resolves.toMatchObject({
      quantity: beforeFrom.quantity,
    });
    await expect(getStockStatus("prod-tx", "wh-b")).resolves.toMatchObject({
      quantity: beforeTo.quantity,
    });
    await expect(countTransferMovements("tx-fail-midway")).resolves.toBe(0);
  });

  it("同時に2つの移動処理を実行しても、成功分だけが反映され総在庫は保存される", async () => {
    await stockIn({ product_id: "prod-tx", warehouse_id: "wh-a", quantity: 10 });

    const transfers = await Promise.allSettled([
      stockTransfer({
        product_id: "prod-tx",
        from_warehouse_id: "wh-a",
        to_warehouse_id: "wh-b",
        quantity: 7,
        reference_id: "tx-concurrent-1",
      }),
      stockTransfer({
        product_id: "prod-tx",
        from_warehouse_id: "wh-a",
        to_warehouse_id: "wh-c",
        quantity: 7,
        reference_id: "tx-concurrent-2",
      }),
    ]);

    expect(transfers.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(transfers.filter((result) => result.status === "rejected")).toHaveLength(1);

    const from = await getStockStatus("prod-tx", "wh-a");
    const toB = await getStockStatus("prod-tx", "wh-b");
    const toC = await getStockStatus("prod-tx", "wh-c");
    expect(from.quantity).toBe(3);
    expect([toB.quantity, toC.quantity].sort((a, b) => a - b)).toEqual([0, 7]);
    expect(from.quantity + toB.quantity + toC.quantity).toBe(10);

    const client = getClient();
    const movementCounts = await client.execute({
      sql: `SELECT reference_id, COUNT(*) AS count
            FROM stock_movements
            WHERE reference_id IN ('tx-concurrent-1', 'tx-concurrent-2')
            GROUP BY reference_id
            ORDER BY reference_id`,
    });
    expect(movementCounts.rows).toHaveLength(1);
    expect(Number(movementCounts.rows[0]!["count"])).toBe(2);
  });

  it("複数ロット移動の途中で失敗すると、ロット残数・履歴・inventory がすべて巻き戻る", async () => {
    await stockIn({ product_id: "prod-tx", warehouse_id: "wh-a", quantity: 5, lot_code: "L1" });
    await stockIn({ product_id: "prod-tx", warehouse_id: "wh-a", quantity: 5, lot_code: "L2" });

    const lotsBefore = await listLots({ product_id: "prod-tx", warehouse_id: "wh-a" });
    const beforeFrom = await getStockStatus("prod-tx", "wh-a");

    await expect(
      stockTransfer({
        product_id: "prod-tx",
        from_warehouse_id: "wh-a",
        to_warehouse_id: "missing-warehouse",
        quantity: 8,
        reference_id: "tx-multi-lot-fail",
      }),
    ).rejects.toThrow();

    const lotsAfter = await listLots({ product_id: "prod-tx", warehouse_id: "wh-a" });
    expect(lotsAfter.map((l) => l.quantity_remaining).sort()).toEqual(
      lotsBefore.map((l) => l.quantity_remaining).sort(),
    );
    await expect(getStockStatus("prod-tx", "wh-a")).resolves.toMatchObject({
      quantity: beforeFrom.quantity,
    });
    await expect(countTransferMovements("tx-multi-lot-fail")).resolves.toBe(0);
  });
});

describe("stockOut concurrency safety", () => {
  beforeEach(async () => {
    await seedMasterData();
  });

  it("同一在庫を奪い合う 2 つの並行 stockOut では、片方が失敗し総在庫は保存される", async () => {
    await stockIn({ product_id: "prod-tx", warehouse_id: "wh-a", quantity: 10 });

    const results = await Promise.allSettled([
      stockOut({
        product_id: "prod-tx",
        warehouse_id: "wh-a",
        quantity: 7,
        reference_id: "out-concurrent-1",
      }),
      stockOut({
        product_id: "prod-tx",
        warehouse_id: "wh-a",
        quantity: 7,
        reference_id: "out-concurrent-2",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const remaining = await getStockStatus("prod-tx", "wh-a");
    expect(remaining.quantity).toBe(3);

    const lots = await listLots({ product_id: "prod-tx", warehouse_id: "wh-a" });
    const sum = lots.reduce((acc, l) => acc + l.quantity_remaining, 0);
    expect(sum).toBe(3);
  });
});
