import { describe, it, expect, beforeEach } from "vitest";
import { getClient } from "../../src/db/client.js";
import { InsufficientStockError } from "../../src/errors/insufficient-stock.js";
import {
  stockIn,
  stockOut,
  getStockStatus,
  getStockAlerts,
} from "../../src/modules/stock.js";
import { setMinQuantity } from "../../src/modules/product.js";

// テスト用のマスタデータを事前投入
async function seedMasterData() {
  const client = getClient();
  await client.batch([
    {
      sql: "INSERT INTO products (id, sku, name, price, cost) VALUES (?, ?, ?, ?, ?)",
      args: ["prod-1", "SKU-001", "テスト商品A", 1000, 500],
    },
    {
      sql: "INSERT INTO products (id, sku, name, price, cost) VALUES (?, ?, ?, ?, ?)",
      args: ["prod-2", "SKU-002", "テスト商品B", 2000, 800],
    },
    {
      sql: "INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)",
      args: ["wh-1", "東京倉庫", "東京"],
    },
    {
      sql: "INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)",
      args: ["wh-2", "大阪倉庫", "大阪"],
    },
  ]);
}

describe("stock module", () => {
  beforeEach(async () => {
    await seedMasterData();
  });

  // ============================================================
  // stockIn
  // ============================================================
  describe("stockIn", () => {
    // --- 正常系 ---
    it("入庫すると inventory が作成される", async () => {
      const movement = await stockIn({
        product_id: "prod-1",
        warehouse_id: "wh-1",
        quantity: 10,
      });

      expect(movement.type).toBe("in");
      expect(movement.quantity).toBe(10);
      expect(movement.product_id).toBe("prod-1");
      expect(movement.warehouse_id).toBe("wh-1");

      const status = await getStockStatus("prod-1", "wh-1");
      expect(status.quantity).toBe(10);
    });

    it("同じ商品×倉庫に複数回入庫すると数量が加算される", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 5 });

      const status = await getStockStatus("prod-1", "wh-1");
      expect(status.quantity).toBe(15);
    });

    it("異なる倉庫への入庫は別々に管理される", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-2", quantity: 5 });

      const status1 = await getStockStatus("prod-1", "wh-1");
      const status2 = await getStockStatus("prod-1", "wh-2");
      expect(status1.quantity).toBe(10);
      expect(status2.quantity).toBe(5);
    });

    it("reference_type と reference_id が記録される", async () => {
      const movement = await stockIn({
        product_id: "prod-1",
        warehouse_id: "wh-1",
        quantity: 10,
        reference_type: "purchase_order",
        reference_id: "po-001",
      });

      expect(movement.reference_type).toBe("purchase_order");
      expect(movement.reference_id).toBe("po-001");
    });

    it("reference 省略時は空文字になる", async () => {
      const movement = await stockIn({
        product_id: "prod-1",
        warehouse_id: "wh-1",
        quantity: 10,
      });

      expect(movement.reference_type).toBe("");
      expect(movement.reference_id).toBe("");
    });

    it("stock_movements に履歴が記録される", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 5 });

      const client = getClient();
      const result = await client.execute({
        sql: "SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at",
        args: ["prod-1"],
      });
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]!["quantity"]).toBe(10);
      expect(result.rows[1]!["quantity"]).toBe(5);
    });

    // --- 異常系 ---
    it("数量が0だとエラーになる", async () => {
      await expect(
        stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 0 }),
      ).rejects.toThrow("入庫数量は1以上を指定してください");
    });

    it("数量が負数だとエラーになる", async () => {
      await expect(
        stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: -5 }),
      ).rejects.toThrow("入庫数量は1以上を指定してください");
    });

    it("存在しない商品への入庫は FK 制約違反でエラーになる", async () => {
      await expect(
        stockIn({ product_id: "nonexistent", warehouse_id: "wh-1", quantity: 10 }),
      ).rejects.toThrow();
    });

    it("存在しない倉庫への入庫は FK 制約違反でエラーになる", async () => {
      await expect(
        stockIn({ product_id: "prod-1", warehouse_id: "nonexistent", quantity: 10 }),
      ).rejects.toThrow();
    });
  });

  // ============================================================
  // stockOut
  // ============================================================
  describe("stockOut", () => {
    // --- 正常系 ---
    it("出庫すると inventory が減少する", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });

      const movement = await stockOut({
        product_id: "prod-1",
        warehouse_id: "wh-1",
        quantity: 3,
      });

      expect(movement.type).toBe("out");
      expect(movement.quantity).toBe(3);

      const status = await getStockStatus("prod-1", "wh-1");
      expect(status.quantity).toBe(7);
    });

    it("在庫全量を出庫できる", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });

      await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });

      const status = await getStockStatus("prod-1", "wh-1");
      expect(status.quantity).toBe(0);
    });

    it("reference_type と reference_id が記録される", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });

      const movement = await stockOut({
        product_id: "prod-1",
        warehouse_id: "wh-1",
        quantity: 3,
        reference_type: "order",
        reference_id: "ord-001",
      });

      expect(movement.reference_type).toBe("order");
      expect(movement.reference_id).toBe("ord-001");
    });

    it("入庫と出庫の履歴が両方記録される", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });
      await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 3 });

      const client = getClient();
      const result = await client.execute({
        sql: "SELECT type, quantity FROM stock_movements WHERE product_id = ? ORDER BY created_at",
        args: ["prod-1"],
      });
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]!["type"]).toBe("in");
      expect(result.rows[1]!["type"]).toBe("out");
    });

    // --- 異常系 ---
    it("在庫不足だと InsufficientStockError になる", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 5 });

      const error = await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InsufficientStockError);
      expect((error as InsufficientStockError).currentQuantity).toBe(5);
      expect((error as InsufficientStockError).requestedQuantity).toBe(10);
      expect((error as InsufficientStockError).message).toBe("在庫不足です: 現在庫=5, 要求=10");
    });

    it("在庫レコードがない状態で出庫すると InsufficientStockError になる", async () => {
      const error = await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 1 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InsufficientStockError);
      expect((error as InsufficientStockError).currentQuantity).toBe(0);
      expect((error as InsufficientStockError).requestedQuantity).toBe(1);
    });

    it("数量が0だとエラーになる", async () => {
      await expect(
        stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 0 }),
      ).rejects.toThrow("出庫数量は1以上を指定してください");
    });

    it("数量が負数だとエラーになる", async () => {
      await expect(
        stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: -5 }),
      ).rejects.toThrow("出庫数量は1以上を指定してください");
    });

    it("存在しない product_id での出庫は InsufficientStockError になる", async () => {
      const error = await stockOut({
        product_id: "nonexistent",
        warehouse_id: "wh-1",
        quantity: 1,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InsufficientStockError);
      expect((error as InsufficientStockError).currentQuantity).toBe(0);
      expect((error as InsufficientStockError).requestedQuantity).toBe(1);
    });

    it("存在しない warehouse_id での出庫は InsufficientStockError になる", async () => {
      const error = await stockOut({
        product_id: "prod-1",
        warehouse_id: "nonexistent",
        quantity: 1,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InsufficientStockError);
      expect((error as InsufficientStockError).currentQuantity).toBe(0);
    });

    // --- 境界値 ---
    it("在庫ちょうどの数量で出庫できる", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 7 });

      await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 7 });

      const status = await getStockStatus("prod-1", "wh-1");
      expect(status.quantity).toBe(0);
    });

    it("在庫より1多い数量で出庫すると InsufficientStockError になる", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 7 });

      await expect(
        stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 8 }),
      ).rejects.toBeInstanceOf(InsufficientStockError);
    });
  });

  // ============================================================
  // getStockStatus
  // ============================================================
  describe("getStockStatus", () => {
    // --- 正常系 ---
    it("在庫がある場合は数量を返す", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });

      const status = await getStockStatus("prod-1", "wh-1");

      expect(status.product_id).toBe("prod-1");
      expect(status.warehouse_id).toBe("wh-1");
      expect(status.quantity).toBe(10);
    });

    it("在庫レコードがない場合は quantity=0 を返す", async () => {
      const status = await getStockStatus("prod-1", "wh-1");

      expect(status.quantity).toBe(0);
    });

    it("異なる商品×倉庫の在庫を個別に取得できる", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });
      await stockIn({ product_id: "prod-2", warehouse_id: "wh-1", quantity: 20 });
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-2", quantity: 30 });

      expect((await getStockStatus("prod-1", "wh-1")).quantity).toBe(10);
      expect((await getStockStatus("prod-2", "wh-1")).quantity).toBe(20);
      expect((await getStockStatus("prod-1", "wh-2")).quantity).toBe(30);
      expect((await getStockStatus("prod-2", "wh-2")).quantity).toBe(0);
    });

    it("入出庫後の正確な残量を返す", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 100 });
      await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 30 });
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });
      await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 50 });

      const status = await getStockStatus("prod-1", "wh-1");
      expect(status.quantity).toBe(30); // 100 - 30 + 10 - 50
    });
  });

  // ============================================================
  // 在庫アラート (getStockAlerts)
  // 閾値は商品単位 (products.min_quantity)、判定は全倉庫合計 <= 閾値
  // ============================================================
  describe("getStockAlerts", () => {
    // --- 正常系 ---
    it("全倉庫合計が最低在庫を下回っている場合にアラートを返す", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });
      await setMinQuantity("SKU-001", 15);

      const alerts = await getStockAlerts();

      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.product_id).toBe("prod-1");
      expect(alerts[0]!.sku).toBe("SKU-001");
      expect(alerts[0]!.product_name).toBe("テスト商品A");
      expect(alerts[0]!.total_quantity).toBe(10);
      expect(alerts[0]!.min_quantity).toBe(15);
    });

    it("閾値ちょうどでもアラートが出る (<= 判定)", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 5 });
      await setMinQuantity("SKU-001", 5);

      const alerts = await getStockAlerts();

      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.total_quantity).toBe(5);
      expect(alerts[0]!.min_quantity).toBe(5);
    });

    it("閾値を超えている場合はアラートが出ない", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 20 });
      await setMinQuantity("SKU-001", 5);

      const alerts = await getStockAlerts();

      expect(alerts).toHaveLength(0);
    });

    it("min_quantity が 0 (デフォルト) の場合はアラートが出ない", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });

      const alerts = await getStockAlerts();

      expect(alerts).toHaveLength(0);
    });

    it("在庫レコードがなく閾値が設定されていればアラート対象になる", async () => {
      await setMinQuantity("SKU-001", 10);

      const alerts = await getStockAlerts();

      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.total_quantity).toBe(0);
      expect(alerts[0]!.min_quantity).toBe(10);
    });

    it("複数倉庫の在庫は合計で判定される", async () => {
      // 東京: 6, 大阪: 4 → 合計10、閾値10 → アラート（<=）
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 6 });
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-2", quantity: 4 });
      await setMinQuantity("SKU-001", 10);

      const alerts = await getStockAlerts();

      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.total_quantity).toBe(10);
    });

    it("複数倉庫の合計が閾値を超えていればアラートは出ない", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 6 });
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-2", quantity: 5 });
      await setMinQuantity("SKU-001", 10);

      const alerts = await getStockAlerts();

      expect(alerts).toHaveLength(0);
    });

    it("複数商品で下回っている分だけアラートを返す", async () => {
      // prod-1: 在庫3, 閾値10 → アラート
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 3 });
      await setMinQuantity("SKU-001", 10);

      // prod-2: 在庫20, 閾値5 → OK
      await stockIn({ product_id: "prod-2", warehouse_id: "wh-1", quantity: 20 });
      await setMinQuantity("SKU-002", 5);

      const alerts = await getStockAlerts();

      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.sku).toBe("SKU-001");
    });

    it("出庫で閾値を下回るとアラート対象になる", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 10 });
      await setMinQuantity("SKU-001", 5);

      // 出庫前: 10 > 5 → OK
      expect(await getStockAlerts()).toHaveLength(0);

      // 出庫後: 3 <= 5 → アラート
      await stockOut({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 7 });

      const alerts = await getStockAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.total_quantity).toBe(3);
    });

    it("結果は SKU 昇順で返る", async () => {
      await stockIn({ product_id: "prod-2", warehouse_id: "wh-1", quantity: 1 });
      await setMinQuantity("SKU-002", 10);
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 1 });
      await setMinQuantity("SKU-001", 10);

      const alerts = await getStockAlerts();
      expect(alerts.map((a) => a.sku)).toEqual(["SKU-001", "SKU-002"]);
    });
  });
});
