import { describe, it, expect, beforeEach } from "vitest";
import { getClient } from "../../src/db/client.js";
import {
  recordTransaction,
  generateSalesReport,
  calculateInventoryValue,
  exportToCSV,
} from "../../src/modules/accounting.js";

async function seedMasterData() {
  const client = getClient();
  await client.batch([
    {
      sql: "INSERT INTO products (id, sku, name, price, cost) VALUES (?, ?, ?, ?, ?)",
      args: ["prod-1", "SKU-001", "商品A", 1000, 500],
    },
    {
      sql: "INSERT INTO products (id, sku, name, price, cost) VALUES (?, ?, ?, ?, ?)",
      args: ["prod-2", "SKU-002", "商品B", 2000, 800],
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

describe("accounting module", () => {
  beforeEach(async () => {
    await seedMasterData();
  });

  // ============================================================
  // recordTransaction
  // ============================================================
  describe("recordTransaction", () => {
    // --- 正常系 ---
    it("sale 取引を記録できる", async () => {
      const tx = await recordTransaction({
        type: "sale",
        amount: 5000,
        reference_type: "order",
        reference_id: "ord-1",
        description: "商品A x 5",
      });

      expect(tx.id).toBeDefined();
      expect(tx.type).toBe("sale");
      expect(tx.amount).toBe(5000);
      expect(tx.reference_type).toBe("order");
      expect(tx.reference_id).toBe("ord-1");
      expect(tx.description).toBe("商品A x 5");
      expect(tx.created_at).toBeDefined();
    });

    it("purchase 取引を記録できる", async () => {
      const tx = await recordTransaction({
        type: "purchase",
        amount: -3000,
        description: "仕入れ",
      });

      expect(tx.type).toBe("purchase");
      expect(tx.amount).toBe(-3000);
    });

    it("refund 取引を記録できる", async () => {
      const tx = await recordTransaction({
        type: "refund",
        amount: -1000,
      });

      expect(tx.type).toBe("refund");
      expect(tx.amount).toBe(-1000);
    });

    it("adjustment 取引を記録できる", async () => {
      const tx = await recordTransaction({
        type: "adjustment",
        amount: 200,
        description: "棚卸し調整",
      });

      expect(tx.type).toBe("adjustment");
    });

    it("reference 省略時は空文字になる", async () => {
      const tx = await recordTransaction({
        type: "sale",
        amount: 1000,
      });

      expect(tx.reference_type).toBe("");
      expect(tx.reference_id).toBe("");
      expect(tx.description).toBe("");
    });

    // --- 異常系 ---
    it("金額が0だとエラーになる", async () => {
      await expect(
        recordTransaction({ type: "sale", amount: 0 }),
      ).rejects.toThrow("金額は0以外を指定してください");
    });
  });

  // ============================================================
  // generateSalesReport
  // ============================================================
  describe("generateSalesReport", () => {
    async function seedSalesData() {
      const client = getClient();

      // 受注データ
      await client.batch([
        {
          sql: "INSERT INTO orders (id, customer_name, total_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          args: ["ord-1", "顧客A", 3000, "2026-04-10 10:00:00", "2026-04-10 10:00:00"],
        },
        {
          sql: "INSERT INTO orders (id, customer_name, total_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          args: ["ord-2", "顧客B", 4000, "2026-04-10 15:00:00", "2026-04-10 15:00:00"],
        },
        {
          sql: "INSERT INTO orders (id, customer_name, total_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          args: ["ord-3", "顧客C", 2000, "2026-04-12 09:00:00", "2026-04-12 09:00:00"],
        },
      ]);

      // 受注明細
      await client.batch([
        {
          sql: "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
          args: ["oi-1", "ord-1", "prod-1", 3, 1000, 3000],
        },
        {
          sql: "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
          args: ["oi-2", "ord-2", "prod-2", 2, 2000, 4000],
        },
        {
          sql: "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
          args: ["oi-3", "ord-3", "prod-1", 2, 1000, 2000],
        },
      ]);

      // 売上取引
      await client.batch([
        {
          sql: "INSERT INTO transactions (id, type, amount, reference_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          args: ["tx-1", "sale", 3000, "order", "ord-1", "2026-04-10 10:00:00"],
        },
        {
          sql: "INSERT INTO transactions (id, type, amount, reference_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          args: ["tx-2", "sale", 4000, "order", "ord-2", "2026-04-10 15:00:00"],
        },
        {
          sql: "INSERT INTO transactions (id, type, amount, reference_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          args: ["tx-3", "sale", 2000, "order", "ord-3", "2026-04-12 09:00:00"],
        },
      ]);
    }

    // --- 正常系 ---
    it("日別の売上が集計される", async () => {
      await seedSalesData();

      const report = await generateSalesReport("2026-04-01", "2026-04-30");

      expect(report.by_date).toHaveLength(2);
      expect(report.by_date[0]!.date).toBe("2026-04-10");
      expect(report.by_date[0]!.total_sales).toBe(7000); // 3000 + 4000
      expect(report.by_date[0]!.transaction_count).toBe(2);
      expect(report.by_date[1]!.date).toBe("2026-04-12");
      expect(report.by_date[1]!.total_sales).toBe(2000);
      expect(report.by_date[1]!.transaction_count).toBe(1);
    });

    it("商品別の売上が集計される", async () => {
      await seedSalesData();

      const report = await generateSalesReport("2026-04-01", "2026-04-30");

      expect(report.by_product).toHaveLength(2);
      // total_sales DESC で並ぶ
      const prodA = report.by_product.find((p) => p.product_id === "prod-1")!;
      const prodB = report.by_product.find((p) => p.product_id === "prod-2")!;
      expect(prodA.product_name).toBe("商品A");
      expect(prodA.total_quantity).toBe(5); // 3 + 2
      expect(prodA.total_sales).toBe(5000); // 3000 + 2000
      expect(prodB.total_quantity).toBe(2);
      expect(prodB.total_sales).toBe(4000);
    });

    it("grand_total が全日分の合計になる", async () => {
      await seedSalesData();

      const report = await generateSalesReport("2026-04-01", "2026-04-30");

      expect(report.grand_total).toBe(9000);
    });

    it("期間指定で対象データが絞り込まれる", async () => {
      await seedSalesData();

      const report = await generateSalesReport("2026-04-11", "2026-04-30");

      expect(report.by_date).toHaveLength(1);
      expect(report.grand_total).toBe(2000);
    });

    it("売上データがない期間は空で返る", async () => {
      const report = await generateSalesReport("2026-01-01", "2026-01-31");

      expect(report.by_date).toEqual([]);
      expect(report.by_product).toEqual([]);
      expect(report.grand_total).toBe(0);
    });

    it("start_date と end_date がレポートに含まれる", async () => {
      const report = await generateSalesReport("2026-04-01", "2026-04-30");

      expect(report.start_date).toBe("2026-04-01");
      expect(report.end_date).toBe("2026-04-30");
    });

    // --- 異常系 ---
    it("end_date < start_date だとエラーになる", async () => {
      await expect(
        generateSalesReport("2026-04-30", "2026-04-01"),
      ).rejects.toThrow("終了日は開始日以降を指定してください");
    });

    // --- 境界値 ---
    it("同一日の期間指定で集計できる", async () => {
      await seedSalesData();

      const report = await generateSalesReport("2026-04-10", "2026-04-10");

      expect(report.by_date).toHaveLength(1);
      expect(report.grand_total).toBe(7000);
    });
  });

  // ============================================================
  // calculateInventoryValue
  // ============================================================
  describe("calculateInventoryValue", () => {
    // --- 正常系 ---
    it("在庫の原価評価額を算出できる", async () => {
      const client = getClient();
      await client.batch([
        {
          sql: "INSERT INTO inventory (id, product_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)",
          args: ["inv-1", "prod-1", "wh-1", 10],
        },
        {
          sql: "INSERT INTO inventory (id, product_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)",
          args: ["inv-2", "prod-2", "wh-1", 5],
        },
      ]);

      const valuation = await calculateInventoryValue();

      expect(valuation.items).toHaveLength(2);
      // prod-2: 5 * 800 = 4000, prod-1: 10 * 500 = 5000 → DESC
      const item1 = valuation.items.find((i) => i.product_id === "prod-1")!;
      const item2 = valuation.items.find((i) => i.product_id === "prod-2")!;
      expect(item1.total_quantity).toBe(10);
      expect(item1.cost).toBe(500);
      expect(item1.total_value).toBe(5000);
      expect(item2.total_quantity).toBe(5);
      expect(item2.cost).toBe(800);
      expect(item2.total_value).toBe(4000);
      expect(valuation.total_value).toBe(9000);
    });

    it("複数倉庫の在庫が商品単位で合算される", async () => {
      const client = getClient();
      await client.batch([
        {
          sql: "INSERT INTO inventory (id, product_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)",
          args: ["inv-1", "prod-1", "wh-1", 10],
        },
        {
          sql: "INSERT INTO inventory (id, product_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)",
          args: ["inv-2", "prod-1", "wh-2", 5],
        },
      ]);

      const valuation = await calculateInventoryValue();

      expect(valuation.items).toHaveLength(1);
      expect(valuation.items[0]!.total_quantity).toBe(15);
      expect(valuation.items[0]!.total_value).toBe(7500); // 15 * 500
    });

    it("在庫がない場合は空で返る", async () => {
      const valuation = await calculateInventoryValue();

      expect(valuation.items).toEqual([]);
      expect(valuation.total_value).toBe(0);
    });

    it("quantity=0 の在庫は含まれない", async () => {
      const client = getClient();
      await client.execute({
        sql: "INSERT INTO inventory (id, product_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)",
        args: ["inv-1", "prod-1", "wh-1", 0],
      });

      const valuation = await calculateInventoryValue();

      expect(valuation.items).toEqual([]);
    });

    it("SKU と商品名が含まれる", async () => {
      const client = getClient();
      await client.execute({
        sql: "INSERT INTO inventory (id, product_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)",
        args: ["inv-1", "prod-1", "wh-1", 10],
      });

      const valuation = await calculateInventoryValue();

      expect(valuation.items[0]!.sku).toBe("SKU-001");
      expect(valuation.items[0]!.product_name).toBe("商品A");
    });
  });

  // ============================================================
  // exportToCSV
  // ============================================================
  describe("exportToCSV", () => {
    // --- 正常系 ---
    it("ヘッダーと行をCSV形式で出力する", () => {
      const csv = exportToCSV(
        ["id", "name", "price"],
        [
          ["1", "商品A", 1000],
          ["2", "商品B", 2000],
        ],
      );

      expect(csv).toBe("id,name,price\n1,商品A,1000\n2,商品B,2000");
    });

    it("カンマを含むフィールドはダブルクォートで囲む", () => {
      const csv = exportToCSV(
        ["name", "description"],
        [["商品A", "赤,青,緑"]],
      );

      expect(csv).toBe('name,description\n商品A,"赤,青,緑"');
    });

    it("ダブルクォートを含むフィールドはエスケープする", () => {
      const csv = exportToCSV(
        ["name"],
        [['サイズ "L"']],
      );

      expect(csv).toBe('name\n"サイズ ""L"""');
    });

    it("改行を含むフィールドはダブルクォートで囲む", () => {
      const csv = exportToCSV(
        ["name", "memo"],
        [["商品A", "1行目\n2行目"]],
      );

      expect(csv).toBe('name,memo\n商品A,"1行目\n2行目"');
    });

    it("空行データの場合はヘッダーのみ出力する", () => {
      const csv = exportToCSV(["id", "name"], []);

      expect(csv).toBe("id,name");
    });

    it("数値が正しく文字列化される", () => {
      const csv = exportToCSV(
        ["price", "cost"],
        [[999.99, 0]],
      );

      expect(csv).toBe("price,cost\n999.99,0");
    });
  });
});
