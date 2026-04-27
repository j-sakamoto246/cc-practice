import { describe, it, expect, beforeEach } from "vitest";
import { getClient } from "../../src/db/client.js";
import { InsufficientStockError } from "../../src/errors/insufficient-stock.js";
import {
  stockIn,
  stockOut,
  stockTransfer,
  getExpiringLots,
  listLots,
  getStockStatus,
} from "../../src/modules/stock.js";

async function seed() {
  const client = getClient();
  await client.batch([
    {
      sql: "INSERT INTO products (id, sku, name, price, cost) VALUES (?, ?, ?, ?, ?)",
      args: ["prod-1", "SKU-FIFO", "FIFO商品", 1000, 500],
    },
    {
      sql: "INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)",
      args: ["wh-1", "倉庫A", "東京"],
    },
    {
      sql: "INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)",
      args: ["wh-2", "倉庫B", "大阪"],
    },
  ]);
}

function isoDateOffsetDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("stockOut FIFO consumption", () => {
  beforeEach(async () => {
    await seed();
  });

  it("単一ロットしかない場合、stock_movements は 1 行で従来と互換", async () => {
    await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });
    const movement = await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 3 });

    expect(movement.type).toBe("out");
    expect(movement.quantity).toBe(3);

    const client = getClient();
    const rows = await client.execute({
      sql: "SELECT type, quantity FROM stock_movements WHERE product_id = ?",
      args: ["prod-1"],
    });
    expect(rows.rows).toHaveLength(2);
    const inRow = rows.rows.find((r) => r["type"] === "in");
    const outRow = rows.rows.find((r) => r["type"] === "out");
    expect(inRow).toBeDefined();
    expect(outRow).toBeDefined();
    expect(outRow!["quantity"]).toBe(3);

    const status = await getStockStatus("prod-1", "wh-1");
    expect(status.quantity).toBe(7);
  });

  it("入庫順が古いロットから先に消費される（期限なし）", async () => {
    await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10, lot_code: "OLD" });
    await new Promise((r) => setTimeout(r, 10));
    await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10, lot_code: "NEW" });

    await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 6 });

    const lots = await listLots({ product_id: "prod-1" });
    const old = lots.find((l) => l.lot_code === "OLD")!;
    const fresh = lots.find((l) => l.lot_code === "NEW")!;
    expect(old.quantity_remaining).toBe(4);
    expect(fresh.quantity_remaining).toBe(10);
  });

  it("複数ロットにまたがる出庫は ロット数だけ stock_movements を生成し inventory も合計通り減る", async () => {
    await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 5, lot_code: "A" });
    await new Promise((r) => setTimeout(r, 5));
    await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 5, lot_code: "B" });
    await new Promise((r) => setTimeout(r, 5));
    await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 5, lot_code: "C" });

    await stockOut({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 12,
      reference_type: "order",
      reference_id: "ord-FIFO",
    });

    const client = getClient();
    const outRows = await client.execute({
      sql: `SELECT sm.quantity, l.lot_code FROM stock_movements sm
            JOIN stock_lots l ON l.id = sm.lot_id
            WHERE sm.type = 'out' AND sm.reference_id = 'ord-FIFO'
            ORDER BY l.lot_code`,
    });
    const consumption: Record<string, number> = {};
    for (const r of outRows.rows) {
      consumption[r["lot_code"] as string] = Number(r["quantity"]);
    }
    expect(consumption).toEqual({ A: 5, B: 5, C: 2 });

    const status = await getStockStatus("prod-1", "wh-1");
    expect(status.quantity).toBe(3);

    const lots = await listLots({ product_id: "prod-1" });
    const sum = lots.reduce((acc, l) => acc + l.quantity_remaining, 0);
    expect(sum).toBe(3);
  });

  it("期限が早いロットは入庫が後でも先に消費される", async () => {
    await stockIn({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 5,
      lot_code: "LATE-EXPIRY",
      expiry_date: isoDateOffsetDays(60),
    });
    await new Promise((r) => setTimeout(r, 10));
    await stockIn({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 5,
      lot_code: "EARLY-EXPIRY",
      expiry_date: isoDateOffsetDays(10),
    });

    await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 4 });

    const lots = await listLots({ product_id: "prod-1" });
    const early = lots.find((l) => l.lot_code === "EARLY-EXPIRY")!;
    const late = lots.find((l) => l.lot_code === "LATE-EXPIRY")!;
    expect(early.quantity_remaining).toBe(1);
    expect(late.quantity_remaining).toBe(5);
  });

  it("期限なしロットは期限ありロットより後ろに回る", async () => {
    await stockIn({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 5,
      lot_code: "NO-EXPIRY",
    });
    await new Promise((r) => setTimeout(r, 10));
    await stockIn({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 5,
      lot_code: "WITH-EXPIRY",
      expiry_date: isoDateOffsetDays(20),
    });

    await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 3 });

    const lots = await listLots({ product_id: "prod-1" });
    const withExpiry = lots.find((l) => l.lot_code === "WITH-EXPIRY")!;
    const noExpiry = lots.find((l) => l.lot_code === "NO-EXPIRY")!;
    expect(withExpiry.quantity_remaining).toBe(2);
    expect(noExpiry.quantity_remaining).toBe(5);
  });

  it("総量不足だと InsufficientStockError でロットも履歴も変化しない", async () => {
    await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 3, lot_code: "A" });
    await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 3, lot_code: "B" });

    const lotsBefore = await listLots({ product_id: "prod-1" });

    await expect(
      stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const lotsAfter = await listLots({ product_id: "prod-1" });
    expect(lotsAfter.map((l) => l.quantity_remaining).sort()).toEqual(
      lotsBefore.map((l) => l.quantity_remaining).sort(),
    );

    const client = getClient();
    const outCount = await client.execute(
      "SELECT COUNT(*) AS c FROM stock_movements WHERE type='out' AND product_id='prod-1'",
    );
    expect(Number(outCount.rows[0]!["c"])).toBe(0);
  });
});

describe("stockTransfer FIFO + lot preservation", () => {
  beforeEach(async () => {
    await seed();
  });

  it("移動先には移動元のロット情報（lot_code/expiry）を継承した新規ロットが作られる", async () => {
    await stockIn({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 4,
      lot_code: "L-EARLY",
      expiry_date: isoDateOffsetDays(15),
    });
    await new Promise((r) => setTimeout(r, 5));
    await stockIn({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 6,
      lot_code: "L-LATE",
      expiry_date: isoDateOffsetDays(45),
    });

    await stockTransfer({
      product_id: "prod-1",
      from_warehouse_id: "wh-1",
      to_warehouse_id: "wh-2",
      quantity: 7,
    });

    const wh2Lots = await listLots({ product_id: "prod-1", warehouse_id: "wh-2" });
    const codes = wh2Lots.map((l) => `${l.lot_code}:${l.quantity_remaining}:${l.expiry_date}`).sort();
    expect(codes).toEqual([
      `L-EARLY:4:${isoDateOffsetDays(15)}`,
      `L-LATE:3:${isoDateOffsetDays(45)}`,
    ]);

    expect((await getStockStatus("prod-1", "wh-1")).quantity).toBe(3);
    expect((await getStockStatus("prod-1", "wh-2")).quantity).toBe(7);
  });
});

describe("getExpiringLots", () => {
  beforeEach(async () => {
    await seed();
  });

  it("daysAhead 内の期限ロットと期限切れ済みを返す（境界値）", async () => {
    await stockIn({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 1,
      lot_code: "EXPIRED",
      expiry_date: isoDateOffsetDays(-3),
    });
    await stockIn({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 1,
      lot_code: "D29",
      expiry_date: isoDateOffsetDays(29),
    });
    await stockIn({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 1,
      lot_code: "D30",
      expiry_date: isoDateOffsetDays(30),
    });
    await stockIn({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 1,
      lot_code: "D31",
      expiry_date: isoDateOffsetDays(31),
    });
    await stockIn({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 1,
      lot_code: "NO-EXPIRY",
    });

    const result = await getExpiringLots(30);
    const codes = result.map((r) => r.lot_code).sort();
    expect(codes).toEqual(["D29", "D30", "EXPIRED"]);
    const expired = result.find((r) => r.lot_code === "EXPIRED")!;
    expect(expired.days_until_expiry).toBeLessThan(0);
  });

  it("残量 0 のロットは結果に含まれない", async () => {
    await stockIn({
      product_id: "prod-1",
      warehouse_id: "wh-1",
      quantity: 5,
      lot_code: "SOON",
      expiry_date: isoDateOffsetDays(5),
    });
    await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 5 });

    const result = await getExpiringLots(30);
    expect(result).toHaveLength(0);
  });
});
