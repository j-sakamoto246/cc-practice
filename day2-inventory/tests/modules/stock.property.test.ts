import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fc from "fast-check";
import { getClient } from "../../src/db/client.js";
import { InsufficientStockError } from "../../src/errors/insufficient-stock.js";
import { getStockStatus, stockIn, stockOut } from "../../src/modules/stock.js";
import { logger } from "../../src/utils/logger.js";

type StockOperation = {
  type: "in" | "out";
  quantity: number;
};

const PRODUCT_ID = "pbt-prod";
const WAREHOUSE_ID = "pbt-wh";
const MAX_INT = Number.MAX_SAFE_INTEGER;

let caseCounter = 0;

async function seedCase() {
  const client = getClient();
  const caseId = caseCounter++;
  const productId = `${PRODUCT_ID}-${caseId}`;
  const warehouseId = `${WAREHOUSE_ID}-${caseId}`;

  await client.batch([
    {
      sql: "INSERT INTO products (id, sku, name, price, cost) VALUES (?, ?, ?, ?, ?)",
      args: [productId, `PBT-${caseId}`, `Property Test Product ${caseId}`, 1000, 500],
    },
    {
      sql: "INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)",
      args: [warehouseId, `Property Test Warehouse ${caseId}`, "test"],
    },
  ]);

  return { productId, warehouseId };
}

async function movementTotals(productId: string, warehouseId: string) {
  const client = getClient();
  const result = await client.execute({
    sql: `SELECT type, COALESCE(SUM(quantity), 0) AS quantity
          FROM stock_movements
          WHERE product_id = ? AND warehouse_id = ?
          GROUP BY type`,
    args: [productId, warehouseId],
  });

  let inbound = 0;
  let outbound = 0;
  for (const row of result.rows) {
    const quantity = Number(row["quantity"]);
    if (row["type"] === "in") inbound = quantity;
    if (row["type"] === "out") outbound = quantity;
  }

  return { inbound, outbound };
}

const operationArbitrary: fc.Arbitrary<StockOperation> = fc.record({
  type: fc.constantFrom("in", "out"),
  quantity: fc.integer({ min: 1, max: 100 }),
});

describe("stock module property-based invariants", () => {
  beforeEach(() => {
    vi.spyOn(logger, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("任意の入出庫列で「入庫数 - 出庫数 = 現在在庫」が成立する", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(operationArbitrary, { minLength: 1, maxLength: 100 }),
        async (operations) => {
          const { productId, warehouseId } = await seedCase();
          let expectedInbound = 0;
          let expectedOutbound = 0;
          let expectedCurrent = 0;

          for (const operation of operations) {
            if (operation.type === "in") {
              await stockIn({
                product_id: productId,
                warehouse_id: warehouseId,
                quantity: operation.quantity,
              });
              expectedInbound += operation.quantity;
              expectedCurrent += operation.quantity;
            } else if (operation.quantity <= expectedCurrent) {
              await stockOut({
                product_id: productId,
                warehouse_id: warehouseId,
                quantity: operation.quantity,
              });
              expectedOutbound += operation.quantity;
              expectedCurrent -= operation.quantity;
            } else {
              await expect(
                stockOut({
                  product_id: productId,
                  warehouse_id: warehouseId,
                  quantity: operation.quantity,
                }),
              ).rejects.toBeInstanceOf(InsufficientStockError);
            }

            const status = await getStockStatus(productId, warehouseId);
            expect(status.quantity).toBe(expectedCurrent);
          }

          const status = await getStockStatus(productId, warehouseId);
          const totals = await movementTotals(productId, warehouseId);

          expect(totals.inbound).toBe(expectedInbound);
          expect(totals.outbound).toBe(expectedOutbound);
          expect(totals.inbound - totals.outbound).toBe(status.quantity);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("大量のランダムな入出庫でも在庫が負にならない", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(operationArbitrary, { minLength: 1, maxLength: 200 }),
        async (operations) => {
          const { productId, warehouseId } = await seedCase();

          for (const operation of operations) {
            if (operation.type === "in") {
              await stockIn({
                product_id: productId,
                warehouse_id: warehouseId,
                quantity: operation.quantity,
              });
            } else {
              await stockOut({
                product_id: productId,
                warehouse_id: warehouseId,
                quantity: operation.quantity,
              }).catch((error: unknown) => {
                expect(error).toBeInstanceOf(InsufficientStockError);
              });
            }

            const status = await getStockStatus(productId, warehouseId);
            expect(status.quantity).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("0個入庫やMAX_INT個出庫などの境界値でも不変条件を壊さない", async () => {
    const boundaryQuantityArbitrary = fc.oneof(
      fc.constant(0),
      fc.constant(-1),
      fc.constant(Number.MIN_SAFE_INTEGER),
      fc.constant(MAX_INT),
      fc.integer({ min: -10, max: 10 }),
    );

    await fc.assert(
      fc.asyncProperty(boundaryQuantityArbitrary, async (quantity) => {
        const { productId, warehouseId } = await seedCase();
        await stockIn({ product_id: productId, warehouse_id: warehouseId, quantity: 10 });

        if (quantity <= 0) {
          await expect(
            stockIn({ product_id: productId, warehouse_id: warehouseId, quantity }),
          ).rejects.toThrow("入庫数量は1以上を指定してください");
          await expect(
            stockOut({ product_id: productId, warehouse_id: warehouseId, quantity }),
          ).rejects.toThrow("出庫数量は1以上を指定してください");
        } else if (quantity > 10) {
          await expect(
            stockOut({ product_id: productId, warehouse_id: warehouseId, quantity }),
          ).rejects.toBeInstanceOf(InsufficientStockError);
        } else {
          await stockOut({ product_id: productId, warehouse_id: warehouseId, quantity });
        }

        const status = await getStockStatus(productId, warehouseId);
        const totals = await movementTotals(productId, warehouseId);

        expect(status.quantity).toBeGreaterThanOrEqual(0);
        expect(totals.inbound - totals.outbound).toBe(status.quantity);
      }),
      { numRuns: 200 },
    );
  });
});
