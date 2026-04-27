import { describe, it, expect } from "vitest";
import { getClient } from "../../src/db/client.js";
import { addProduct, setLeadTime } from "../../src/modules/product.js";
import { stockIn } from "../../src/modules/stock.js";
import { forecastProducts } from "../../src/modules/forecast.js";

async function ensureWarehouse(id: string, name: string): Promise<void> {
  const client = getClient();
  await client.execute({
    sql: "INSERT OR IGNORE INTO warehouses (id, name) VALUES (?, ?)",
    args: [id, name],
  });
}

// dailyDemands[i] は「i 日前」の出庫数量（i=0 が今日、i=days-1 が最も古い日）
async function seedDailyOut(
  productId: string,
  warehouseId: string,
  dailyDemands: number[],
): Promise<void> {
  const client = getClient();
  for (let i = 0; i < dailyDemands.length; i++) {
    const q = dailyDemands[i]!;
    if (q === 0) continue;
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const ts = d.toISOString().replace("T", " ").slice(0, 19);
    await client.execute({
      sql: `INSERT INTO stock_movements (id, product_id, warehouse_id, type, quantity, created_at)
            VALUES (?, ?, ?, 'out', ?, ?)`,
      args: [`mv-${productId}-${warehouseId}-${i}`, productId, warehouseId, q, ts],
    });
  }
}

describe("forecast module", () => {
  describe("forecastProducts - 統計値", () => {
    it("移動平均と標本標準偏差を正しく計算する", async () => {
      await ensureWarehouse("wh-1", "倉庫A");
      const product = await addProduct({
        sku: "F-001",
        name: "予測対象A",
        price: 1000,
        cost: 500,
      });
      // demands: [10, 12, 8, 11, 9] -> mean=10, var=10/4=2.5, sd=√2.5
      await seedDailyOut(product.id, "wh-1", [10, 12, 8, 11, 9]);

      const forecasts = await forecastProducts({
        sku: "F-001",
        days: 5,
        confidence: 0.95,
        orderCost: 1000,
        holdingRate: 0.2,
      });

      expect(forecasts).toHaveLength(1);
      const f = forecasts[0]!;
      expect(f.avg_daily_demand).toBeCloseTo(10, 6);
      expect(f.std_daily_demand).toBeCloseTo(Math.sqrt(2.5), 6);
      expect(f.daily_series).toHaveLength(5);
    });

    it("出庫がない日は需要 0 として系列に含まれる", async () => {
      await ensureWarehouse("wh-1", "倉庫A");
      await addProduct({
        sku: "F-EMPTY",
        name: "出庫なし",
        price: 1000,
        cost: 500,
      });

      const forecasts = await forecastProducts({
        sku: "F-EMPTY",
        days: 7,
        confidence: 0.95,
        orderCost: 1000,
        holdingRate: 0.2,
      });
      const f = forecasts[0]!;
      expect(f.daily_series).toHaveLength(7);
      expect(f.daily_series.every((p) => p.demand === 0)).toBe(true);
      expect(f.avg_daily_demand).toBe(0);
      expect(f.std_daily_demand).toBe(0);
      expect(f.recommended_order).toBe(0);
    });
  });

  describe("forecastProducts - 安全在庫・発注点・EOQ", () => {
    it("安全在庫 = z * SD * √L", async () => {
      await ensureWarehouse("wh-1", "倉庫A");
      const product = await addProduct({
        sku: "F-002",
        name: "予測対象B",
        price: 1000,
        cost: 500,
      });
      await setLeadTime("F-002", 4);
      await seedDailyOut(product.id, "wh-1", [10, 12, 8, 11, 9]);

      const [f] = await forecastProducts({
        sku: "F-002",
        days: 5,
        confidence: 0.95,
        orderCost: 1000,
        holdingRate: 0.2,
      });

      const expectedSafety = 1.96 * Math.sqrt(2.5) * Math.sqrt(4);
      expect(f!.safety_stock).toBeCloseTo(expectedSafety, 6);
      // 発注点 = avg * L + safety = 10*4 + safety
      expect(f!.reorder_point).toBeCloseTo(40 + expectedSafety, 6);
    });

    it("EOQ = √(2DS/H), D=平均日次需要*365, H=cost*holding_rate", async () => {
      await ensureWarehouse("wh-1", "倉庫A");
      const product = await addProduct({
        sku: "F-003",
        name: "EOQ対象",
        price: 2000,
        cost: 500,
      });
      await seedDailyOut(product.id, "wh-1", [10, 12, 8, 11, 9]);

      const [f] = await forecastProducts({
        sku: "F-003",
        days: 5,
        confidence: 0.95,
        orderCost: 1000,
        holdingRate: 0.2,
      });

      // D=10*365=3650, S=1000, H=500*0.2=100 -> sqrt(73000) ≈ 270.18
      const expectedEoq = Math.sqrt((2 * 3650 * 1000) / (500 * 0.2));
      expect(f!.eoq).toBeCloseTo(expectedEoq, 4);
      expect(f!.annual_demand).toBeCloseTo(3650, 4);
    });

    it("信頼水準を変えると z が変わり安全在庫も変わる", async () => {
      await ensureWarehouse("wh-1", "倉庫A");
      const product = await addProduct({
        sku: "F-CONF",
        name: "信頼水準テスト",
        price: 1000,
        cost: 500,
      });
      await seedDailyOut(product.id, "wh-1", [10, 12, 8, 11, 9]);

      const [f90] = await forecastProducts({
        sku: "F-CONF",
        days: 5,
        confidence: 0.9,
        orderCost: 1000,
        holdingRate: 0.2,
      });
      const [f99] = await forecastProducts({
        sku: "F-CONF",
        days: 5,
        confidence: 0.99,
        orderCost: 1000,
        holdingRate: 0.2,
      });

      expect(f90!.z_score).toBe(1.645);
      expect(f99!.z_score).toBe(2.576);
      expect(f99!.safety_stock).toBeGreaterThan(f90!.safety_stock);
    });

    it("サポート外の信頼水準でエラー", async () => {
      await expect(
        forecastProducts({
          days: 5,
          confidence: 0.7,
          orderCost: 1000,
          holdingRate: 0.2,
        }),
      ).rejects.toThrow("サポートしていない信頼水準");
    });
  });

  describe("forecastProducts - 推奨発注量", () => {
    it("現在庫 > 発注点なら推奨発注量は 0", async () => {
      await ensureWarehouse("wh-1", "倉庫A");
      const product = await addProduct({
        sku: "F-PLENTY",
        name: "在庫潤沢",
        price: 1000,
        cost: 500,
      });
      await setLeadTime("F-PLENTY", 2);
      await seedDailyOut(product.id, "wh-1", [10, 10, 10, 10, 10]);
      // 大量在庫を入庫
      await stockIn({
        product_id: product.id,
        warehouse_id: "wh-1",
        quantity: 10000,
      });

      const [f] = await forecastProducts({
        sku: "F-PLENTY",
        days: 5,
        confidence: 0.95,
        orderCost: 1000,
        holdingRate: 0.2,
      });
      expect(f!.recommended_order).toBe(0);
    });

    it("現在庫 < 発注点なら 推奨 = max(発注点-現在庫, EOQ)", async () => {
      await ensureWarehouse("wh-1", "倉庫A");
      const product = await addProduct({
        sku: "F-LOW",
        name: "在庫不足",
        price: 1000,
        cost: 500,
      });
      await setLeadTime("F-LOW", 4);
      await seedDailyOut(product.id, "wh-1", [10, 12, 8, 11, 9]);
      // 在庫 5 のみ → 発注点 ≈ 40+α >> 5
      await stockIn({
        product_id: product.id,
        warehouse_id: "wh-1",
        quantity: 5,
      });

      const [f] = await forecastProducts({
        sku: "F-LOW",
        days: 5,
        confidence: 0.95,
        orderCost: 1000,
        holdingRate: 0.2,
      });

      const gap = f!.reorder_point - f!.on_hand;
      expect(f!.recommended_order).toBeCloseTo(Math.max(gap, f!.eoq), 6);
      expect(f!.recommended_order).toBeGreaterThan(0);
    });
  });

  describe("forecastProducts - スコープ", () => {
    it("全商品モードで複数商品を返す", async () => {
      await ensureWarehouse("wh-1", "倉庫A");
      const a = await addProduct({ sku: "A-1", name: "A", price: 100, cost: 50 });
      const b = await addProduct({ sku: "B-1", name: "B", price: 100, cost: 50 });
      await seedDailyOut(a.id, "wh-1", [3, 3, 3]);
      await seedDailyOut(b.id, "wh-1", [5, 5, 5]);

      const all = await forecastProducts({
        days: 3,
        confidence: 0.95,
        orderCost: 1000,
        holdingRate: 0.2,
      });
      expect(all.map((f) => f.sku).sort()).toEqual(["A-1", "B-1"]);
    });

    it("warehouse-id を指定すると他倉庫の出庫は集計されない", async () => {
      await ensureWarehouse("wh-1", "倉庫A");
      await ensureWarehouse("wh-2", "倉庫B");
      const product = await addProduct({
        sku: "F-WH",
        name: "倉庫別",
        price: 1000,
        cost: 500,
      });
      await seedDailyOut(product.id, "wh-1", [10, 10, 10]);
      await seedDailyOut(product.id, "wh-2", [99, 99, 99]);

      const [fAll] = await forecastProducts({
        sku: "F-WH",
        days: 3,
        confidence: 0.95,
        orderCost: 1000,
        holdingRate: 0.2,
      });
      const [fWh1] = await forecastProducts({
        sku: "F-WH",
        warehouseId: "wh-1",
        days: 3,
        confidence: 0.95,
        orderCost: 1000,
        holdingRate: 0.2,
      });

      expect(fAll!.avg_daily_demand).toBeCloseTo((10 + 99), 6); // 全倉庫合算
      expect(fWh1!.avg_daily_demand).toBeCloseTo(10, 6);
    });

    it("存在しない SKU でエラー", async () => {
      await expect(
        forecastProducts({
          sku: "DOES-NOT-EXIST",
          days: 5,
          confidence: 0.95,
          orderCost: 1000,
          holdingRate: 0.2,
        }),
      ).rejects.toThrow("商品が見つかりません");
    });
  });

  describe("forecastProducts - 入力検証", () => {
    it("days <= 0 でエラー", async () => {
      await expect(
        forecastProducts({
          days: 0,
          confidence: 0.95,
          orderCost: 1000,
          holdingRate: 0.2,
        }),
      ).rejects.toThrow("days は1以上の整数");
    });

    it("order-cost が負数でエラー", async () => {
      await expect(
        forecastProducts({
          days: 5,
          confidence: 0.95,
          orderCost: -1,
          holdingRate: 0.2,
        }),
      ).rejects.toThrow("order-cost は0以上");
    });

    it("holding-rate が負数でエラー", async () => {
      await expect(
        forecastProducts({
          days: 5,
          confidence: 0.95,
          orderCost: 1000,
          holdingRate: -0.1,
        }),
      ).rejects.toThrow("holding-rate は0以上");
    });
  });
});
