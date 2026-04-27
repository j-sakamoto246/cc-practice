import { describe, it, expect, beforeEach } from "vitest";
import { getClient } from "../../src/db/client.js";
import {
  createOrder,
  listOrders,
  updateOrderStatus,
} from "../../src/modules/order.js";
import { InsufficientStockError } from "../../src/errors/insufficient-stock.js";
import { stockIn } from "../../src/modules/stock.js";

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
  ]);
}

describe("order module", () => {
  beforeEach(async () => {
    await seedMasterData();
  });

  const sampleInput = {
    customer_name: "テスト顧客",
    items: [
      { product_id: "prod-1", quantity: 2, unit_price: 1000 },
    ],
  };

  // ============================================================
  // createOrder
  // ============================================================
  describe("createOrder", () => {
    // --- 正常系 ---
    it("受注を作成できる", async () => {
      const order = await createOrder(sampleInput);

      expect(order.id).toBeDefined();
      expect(order.customer_name).toBe("テスト顧客");
      expect(order.status).toBe("pending");
      expect(order.total_amount).toBe(2000);
      expect(order.items).toHaveLength(1);
      expect(order.items[0]!.product_id).toBe("prod-1");
      expect(order.items[0]!.quantity).toBe(2);
      expect(order.items[0]!.unit_price).toBe(1000);
      expect(order.items[0]!.subtotal).toBe(2000);
    });

    it("複数明細の受注を作成できる", async () => {
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [
          { product_id: "prod-1", quantity: 2, unit_price: 1000 },
          { product_id: "prod-2", quantity: 1, unit_price: 2000 },
        ],
      });

      expect(order.items).toHaveLength(2);
      expect(order.total_amount).toBe(4000); // 2*1000 + 1*2000
    });

    it("total_amount が全明細の subtotal 合計になる", async () => {
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [
          { product_id: "prod-1", quantity: 3, unit_price: 1000 },
          { product_id: "prod-2", quantity: 2, unit_price: 2000 },
        ],
      });

      expect(order.total_amount).toBe(7000); // 3*1000 + 2*2000
    });

    it("初期ステータスは pending になる", async () => {
      const order = await createOrder(sampleInput);
      expect(order.status).toBe("pending");
    });

    it("created_at と updated_at が設定される", async () => {
      const order = await createOrder(sampleInput);

      const datePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
      expect(order.created_at).toMatch(datePattern);
      expect(order.updated_at).toMatch(datePattern);
    });

    // --- 異常系 ---
    it("明細が空だとエラーになる", async () => {
      await expect(
        createOrder({ customer_name: "テスト顧客", items: [] }),
      ).rejects.toThrow("受注には1つ以上の明細が必要です");
    });

    it("存在しない商品を指定するとエラーになる", async () => {
      await expect(
        createOrder({
          customer_name: "テスト顧客",
          items: [{ product_id: "nonexistent", quantity: 1, unit_price: 1000 }],
        }),
      ).rejects.toThrow();
    });

    // --- 境界値 ---
    it("数量1・単価0の明細で作成できる", async () => {
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 1, unit_price: 0 }],
      });

      expect(order.total_amount).toBe(0);
      expect(order.items[0]!.subtotal).toBe(0);
    });
  });

  // ============================================================
  // listOrders
  // ============================================================
  describe("listOrders", () => {
    // --- 正常系 ---
    it("受注0件で空配列を返す", async () => {
      const orders = await listOrders();
      expect(orders).toEqual([]);
    });

    it("作成した受注が一覧に含まれる", async () => {
      await createOrder(sampleInput);
      await createOrder({
        customer_name: "別の顧客",
        items: [{ product_id: "prod-2", quantity: 1, unit_price: 2000 }],
      });

      const orders = await listOrders();
      expect(orders).toHaveLength(2);
    });

    it("created_at DESC の順序で返る", async () => {
      const client = getClient();
      await client.execute({
        sql: "INSERT INTO orders (id, customer_name, total_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        args: ["ord-old", "古い顧客", 1000, "2025-01-01 00:00:00", "2025-01-01 00:00:00"],
      });
      await client.execute({
        sql: "INSERT INTO orders (id, customer_name, total_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        args: ["ord-new", "新しい顧客", 2000, "2025-06-01 00:00:00", "2025-06-01 00:00:00"],
      });

      const orders = await listOrders();
      expect(orders[0]!.id).toBe("ord-new");
      expect(orders[1]!.id).toBe("ord-old");
    });
  });

  // ============================================================
  // updateOrderStatus
  // ============================================================
  describe("updateOrderStatus", () => {
    // --- 正常系: 正規遷移パス ---
    it("pending → confirmed に遷移できる", async () => {
      const order = await createOrder(sampleInput);

      const updated = await updateOrderStatus(order.id, "confirmed");

      expect(updated.status).toBe("confirmed");
    });

    it("confirmed → processing に遷移できる", async () => {
      const order = await createOrder(sampleInput);
      await updateOrderStatus(order.id, "confirmed");

      const updated = await updateOrderStatus(order.id, "processing");

      expect(updated.status).toBe("processing");
    });

    it("processing → shipped に遷移できる", async () => {
      const order = await createOrder(sampleInput);
      await updateOrderStatus(order.id, "confirmed");
      await updateOrderStatus(order.id, "processing");

      const updated = await updateOrderStatus(order.id, "shipped");

      expect(updated.status).toBe("shipped");
    });

    it("shipped → delivered に遷移できる", async () => {
      const order = await createOrder(sampleInput);
      await updateOrderStatus(order.id, "confirmed");
      await updateOrderStatus(order.id, "processing");
      await updateOrderStatus(order.id, "shipped");

      const updated = await updateOrderStatus(order.id, "delivered");

      expect(updated.status).toBe("delivered");
    });

    it("pending → cancelled に遷移できる", async () => {
      const order = await createOrder(sampleInput);

      const updated = await updateOrderStatus(order.id, "cancelled");

      expect(updated.status).toBe("cancelled");
    });

    it("confirmed → cancelled に遷移できる", async () => {
      const order = await createOrder(sampleInput);
      await updateOrderStatus(order.id, "confirmed");

      const updated = await updateOrderStatus(order.id, "cancelled");

      expect(updated.status).toBe("cancelled");
    });

    it("processing → cancelled に遷移できる", async () => {
      const order = await createOrder(sampleInput);
      await updateOrderStatus(order.id, "confirmed");
      await updateOrderStatus(order.id, "processing");

      const updated = await updateOrderStatus(order.id, "cancelled");

      expect(updated.status).toBe("cancelled");
    });

    it("更新後に updated_at が設定される", async () => {
      const order = await createOrder(sampleInput);

      const updated = await updateOrderStatus(order.id, "confirmed");

      expect(updated.updated_at).toBeDefined();
      expect(updated.created_at).toBe(order.created_at);
    });

    // --- 異常系: 不正遷移 ---
    it("pending → shipped は遷移できない", async () => {
      const order = await createOrder(sampleInput);

      await expect(
        updateOrderStatus(order.id, "shipped"),
      ).rejects.toThrow("ステータスを pending から shipped に変更できません");
    });

    it("pending → delivered は遷移できない", async () => {
      const order = await createOrder(sampleInput);

      await expect(
        updateOrderStatus(order.id, "delivered"),
      ).rejects.toThrow("ステータスを pending から delivered に変更できません");
    });

    it("pending → processing は遷移できない", async () => {
      const order = await createOrder(sampleInput);

      await expect(
        updateOrderStatus(order.id, "processing"),
      ).rejects.toThrow("ステータスを pending から processing に変更できません");
    });

    it("delivered からは遷移できない", async () => {
      const order = await createOrder(sampleInput);
      await updateOrderStatus(order.id, "confirmed");
      await updateOrderStatus(order.id, "processing");
      await updateOrderStatus(order.id, "shipped");
      await updateOrderStatus(order.id, "delivered");

      await expect(
        updateOrderStatus(order.id, "cancelled"),
      ).rejects.toThrow("ステータスを delivered から cancelled に変更できません");
    });

    it("cancelled からは遷移できない", async () => {
      const order = await createOrder(sampleInput);
      await updateOrderStatus(order.id, "cancelled");

      await expect(
        updateOrderStatus(order.id, "pending"),
      ).rejects.toThrow("ステータスを cancelled から pending に変更できません");
    });

    it("shipped → cancelled は遷移できない", async () => {
      const order = await createOrder(sampleInput);
      await updateOrderStatus(order.id, "confirmed");
      await updateOrderStatus(order.id, "processing");
      await updateOrderStatus(order.id, "shipped");

      await expect(
        updateOrderStatus(order.id, "cancelled"),
      ).rejects.toThrow("ステータスを shipped から cancelled に変更できません");
    });

    // --- 異常系: その他 ---
    it("存在しない受注を更新するとエラーになる", async () => {
      await expect(
        updateOrderStatus("nonexistent", "confirmed"),
      ).rejects.toThrow("受注が見つかりません");
    });

    it("無効なステータスを指定するとエラーになる", async () => {
      const order = await createOrder(sampleInput);

      await expect(
        updateOrderStatus(order.id, "invalid_status"),
      ).rejects.toThrow("無効なステータスです: invalid_status");
    });
  });

  // ============================================================
  // 在庫チェック付き受注作成
  // ============================================================
  describe("createOrder (在庫チェック)", () => {
    it("在庫が足りない商品で受注を作成するとエラーになる", async () => {
      // 在庫5個に対して10個の受注
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 5 });

      const error = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 10, unit_price: 1000 }],
        warehouse_id: "wh-1",
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InsufficientStockError);
      expect((error as InsufficientStockError).currentQuantity).toBe(5);
      expect((error as InsufficientStockError).requestedQuantity).toBe(10);
    });

    it("在庫が0の商品で受注を作成するとエラーになる", async () => {
      await expect(
        createOrder({
          customer_name: "テスト顧客",
          items: [{ product_id: "prod-1", quantity: 1, unit_price: 1000 }],
          warehouse_id: "wh-1",
        }),
      ).rejects.toBeInstanceOf(InsufficientStockError);
    });

    it("在庫ちょうどの数量で受注を作成できる", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 5 });

      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 5, unit_price: 1000 }],
        warehouse_id: "wh-1",
      });

      expect(order.id).toBeDefined();
      expect(order.total_amount).toBe(5000);
    });

    it("複数明細で1つでも在庫不足ならエラーになる", async () => {
      await stockIn({ product_id: "prod-1", warehouse_id: "wh-1", quantity: 100 });
      await stockIn({ product_id: "prod-2", warehouse_id: "wh-1", quantity: 2 });

      await expect(
        createOrder({
          customer_name: "テスト顧客",
          items: [
            { product_id: "prod-1", quantity: 3, unit_price: 1000 },
            { product_id: "prod-2", quantity: 5, unit_price: 2000 },
          ],
          warehouse_id: "wh-1",
        }),
      ).rejects.toBeInstanceOf(InsufficientStockError);
    });

    it("warehouse_id を省略した場合は在庫チェックなしで受注できる", async () => {
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 100, unit_price: 1000 }],
      });

      expect(order.id).toBeDefined();
    });
  });
});
