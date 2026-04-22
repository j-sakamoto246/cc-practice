import { describe, it, expect, beforeEach } from "vitest";
import { getClient } from "../../src/db/client.js";
import { addProduct } from "../../src/modules/product.js";
import { stockIn, stockOut, getStockStatus } from "../../src/modules/stock.js";
import { createOrder, updateOrderStatus } from "../../src/modules/order.js";
import { createCampaign, applyCampaign } from "../../src/modules/campaign.js";
import {
  recordTransaction,
  generateSalesReport,
  calculateInventoryValue,
} from "../../src/modules/accounting.js";
import { InsufficientStockError } from "../../src/errors/insufficient-stock.js";
import { generateId } from "../../src/utils/id.js";

// 共通のマスタデータ投入
async function seedWarehouses() {
  const client = getClient();
  await client.batch([
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

// ============================================================
// 1. 基本的な在庫フロー
// ============================================================
describe("基本的な在庫フロー: 商品登録 → 入庫 → 受注 → 出庫 → 発送", () => {
  beforeEach(async () => {
    await seedWarehouses();
  });

  it("商品登録から発送までの一連のフローが完了する", async () => {
    // Step 1: 商品登録
    const productA = await addProduct({
      sku: "WIDGET-001",
      name: "ウィジェットA",
      price: 1500,
      cost: 600,
    });
    const productB = await addProduct({
      sku: "WIDGET-002",
      name: "ウィジェットB",
      price: 3000,
      cost: 1200,
    });

    // Step 2: 入庫
    await stockIn({ product_id: productA.id, warehouse_id: "wh-1", quantity: 100 });
    await stockIn({ product_id: productB.id, warehouse_id: "wh-1", quantity: 50 });

    // 在庫を確認
    const stockA = await getStockStatus(productA.id, "wh-1");
    const stockB = await getStockStatus(productB.id, "wh-1");
    expect(stockA.quantity).toBe(100);
    expect(stockB.quantity).toBe(50);

    // Step 3: 受注作成
    const order = await createOrder({
      customer_name: "テスト商事",
      items: [
        { product_id: productA.id, quantity: 10, unit_price: productA.price },
        { product_id: productB.id, quantity: 5, unit_price: productB.price },
      ],
    });

    expect(order.status).toBe("pending");
    expect(order.total_amount).toBe(10 * 1500 + 5 * 3000); // 30000
    expect(order.items).toHaveLength(2);

    // Step 4: 受注確認 → 出庫
    await updateOrderStatus(order.id, "confirmed");
    await updateOrderStatus(order.id, "processing");

    await stockOut({
      product_id: productA.id,
      warehouse_id: "wh-1",
      quantity: 10,
      reference_type: "order",
      reference_id: order.id,
    });
    await stockOut({
      product_id: productB.id,
      warehouse_id: "wh-1",
      quantity: 5,
      reference_type: "order",
      reference_id: order.id,
    });

    // 在庫減少を確認
    const stockAAfter = await getStockStatus(productA.id, "wh-1");
    const stockBAfter = await getStockStatus(productB.id, "wh-1");
    expect(stockAAfter.quantity).toBe(90);
    expect(stockBAfter.quantity).toBe(45);

    // Step 5: 発送
    await updateOrderStatus(order.id, "shipped");

    const client = getClient();
    const shipmentId = generateId();
    await client.execute({
      sql: `INSERT INTO shipments (id, order_id, tracking_number, carrier, status, shipped_at)
            VALUES (?, ?, ?, ?, 'shipped', datetime('now'))`,
      args: [shipmentId, order.id, "TRACK-12345", "ヤマト運輸"],
    });

    // 発送レコードの確認
    const shipmentResult = await client.execute({
      sql: "SELECT * FROM shipments WHERE order_id = ?",
      args: [order.id],
    });
    expect(shipmentResult.rows).toHaveLength(1);
    expect(shipmentResult.rows[0]!["tracking_number"]).toBe("TRACK-12345");
    expect(shipmentResult.rows[0]!["carrier"]).toBe("ヤマト運輸");
    expect(shipmentResult.rows[0]!["status"]).toBe("shipped");

    // 売上取引を記録
    await recordTransaction({
      type: "sale",
      amount: order.total_amount,
      reference_type: "order",
      reference_id: order.id,
      description: "テスト商事向け出荷",
    });

    // 配送完了
    await updateOrderStatus(order.id, "delivered");

    // 最終ステータス確認
    const finalOrderResult = await client.execute({
      sql: "SELECT status FROM orders WHERE id = ?",
      args: [order.id],
    });
    expect(finalOrderResult.rows[0]!["status"]).toBe("delivered");
  });

  it("在庫不足の場合は出庫が失敗する", async () => {
    const product = await addProduct({
      sku: "LIMITED-001",
      name: "限定商品",
      price: 5000,
      cost: 2000,
    });

    await stockIn({ product_id: product.id, warehouse_id: "wh-1", quantity: 3 });

    const order = await createOrder({
      customer_name: "大口顧客",
      items: [{ product_id: product.id, quantity: 5, unit_price: product.price }],
    });

    await updateOrderStatus(order.id, "confirmed");
    await updateOrderStatus(order.id, "processing");

    // 在庫3に対して5の出庫はエラー
    await expect(
      stockOut({
        product_id: product.id,
        warehouse_id: "wh-1",
        quantity: 5,
        reference_type: "order",
        reference_id: order.id,
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    // 在庫は変わっていない
    const stock = await getStockStatus(product.id, "wh-1");
    expect(stock.quantity).toBe(3);
  });

  it("複数倉庫からの出庫で在庫が正しく管理される", async () => {
    const product = await addProduct({
      sku: "MULTI-001",
      name: "マルチ倉庫商品",
      price: 1000,
      cost: 400,
    });

    // 2倉庫に入庫
    await stockIn({ product_id: product.id, warehouse_id: "wh-1", quantity: 20 });
    await stockIn({ product_id: product.id, warehouse_id: "wh-2", quantity: 30 });

    // 東京から8出庫、大阪から12出庫
    await stockOut({ product_id: product.id, warehouse_id: "wh-1", quantity: 8 });
    await stockOut({ product_id: product.id, warehouse_id: "wh-2", quantity: 12 });

    const stock1 = await getStockStatus(product.id, "wh-1");
    const stock2 = await getStockStatus(product.id, "wh-2");
    expect(stock1.quantity).toBe(12);
    expect(stock2.quantity).toBe(18);

    // stock_movements に4件記録されている
    const client = getClient();
    const movements = await client.execute({
      sql: "SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at",
      args: [product.id],
    });
    expect(movements.rows).toHaveLength(4);
  });
});

// ============================================================
// 2. キャンペーン適用フロー
// ============================================================
describe("キャンペーン適用フロー: キャンペーン作成 → 受注 → 適用 → 割引確認", () => {
  beforeEach(async () => {
    await seedWarehouses();
  });

  it("percentage キャンペーンが受注に正しく適用される", async () => {
    const product = await addProduct({
      sku: "SALE-001",
      name: "セール対象商品",
      price: 2000,
      cost: 800,
    });

    // 20% OFF キャンペーン
    const campaign = await createCampaign({
      name: "春の大セール",
      discount_type: "percentage",
      discount_value: 20,
      start_date: "2026-04-01",
      end_date: "2026-04-30",
    });

    // 受注: 2000円 x 3 = 6000円
    const order = await createOrder({
      customer_name: "セール顧客",
      items: [{ product_id: product.id, quantity: 3, unit_price: product.price }],
    });
    expect(order.total_amount).toBe(6000);

    // キャンペーン適用
    const result = await applyCampaign(order.id, campaign.id, "2026-04-15");

    expect(result.original_amount).toBe(6000);
    expect(result.discount_amount).toBe(1200); // 6000 * 20%
    expect(result.final_amount).toBe(4800);

    // DB 上の受注金額も更新されている
    const client = getClient();
    const orderResult = await client.execute({
      sql: "SELECT total_amount FROM orders WHERE id = ?",
      args: [order.id],
    });
    expect(orderResult.rows[0]!["total_amount"]).toBe(4800);
  });

  it("fixed キャンペーンが受注に正しく適用される", async () => {
    const product = await addProduct({
      sku: "COUPON-001",
      name: "クーポン対象商品",
      price: 1000,
      cost: 400,
    });

    // 1000円引きクーポン
    const campaign = await createCampaign({
      name: "1000円OFFクーポン",
      discount_type: "fixed",
      discount_value: 1000,
      start_date: "2026-04-01",
      end_date: "2026-04-30",
    });

    // 受注: 1000円 x 5 = 5000円
    const order = await createOrder({
      customer_name: "クーポン顧客",
      items: [{ product_id: product.id, quantity: 5, unit_price: product.price }],
    });

    const result = await applyCampaign(order.id, campaign.id, "2026-04-15");

    expect(result.original_amount).toBe(5000);
    expect(result.discount_amount).toBe(1000);
    expect(result.final_amount).toBe(4000);
  });

  it("期間外のキャンペーンは適用できない", async () => {
    const product = await addProduct({
      sku: "EXPIRED-001",
      name: "商品",
      price: 1000,
      cost: 500,
    });

    const campaign = await createCampaign({
      name: "終了済みキャンペーン",
      discount_type: "percentage",
      discount_value: 10,
      start_date: "2026-03-01",
      end_date: "2026-03-31",
    });

    const order = await createOrder({
      customer_name: "遅刻顧客",
      items: [{ product_id: product.id, quantity: 1, unit_price: product.price }],
    });

    await expect(
      applyCampaign(order.id, campaign.id, "2026-04-15"),
    ).rejects.toThrow("キャンペーン期間外です");

    // 受注金額は変わっていない
    const client = getClient();
    const orderResult = await client.execute({
      sql: "SELECT total_amount FROM orders WHERE id = ?",
      args: [order.id],
    });
    expect(orderResult.rows[0]!["total_amount"]).toBe(1000);
  });

  it("confirmed 受注にはキャンペーンを適用できない", async () => {
    const product = await addProduct({
      sku: "CONFIRMED-001",
      name: "商品",
      price: 1000,
      cost: 500,
    });

    const campaign = await createCampaign({
      name: "テストキャンペーン",
      discount_type: "percentage",
      discount_value: 10,
      start_date: "2026-04-01",
      end_date: "2026-04-30",
    });

    const order = await createOrder({
      customer_name: "テスト顧客",
      items: [{ product_id: product.id, quantity: 1, unit_price: product.price }],
    });

    await updateOrderStatus(order.id, "confirmed");

    await expect(
      applyCampaign(order.id, campaign.id, "2026-04-15"),
    ).rejects.toThrow("pending 以外の受注にはキャンペーンを適用できません");
  });
});

// ============================================================
// 3. 会計レポートフロー
// ============================================================
describe("会計レポートフロー: 取引記録 → レポート生成 → 集計検証", () => {
  beforeEach(async () => {
    await seedWarehouses();
  });

  it("複数取引の売上レポートが正しく集計される", async () => {
    const productA = await addProduct({
      sku: "REPORT-001",
      name: "レポート商品A",
      price: 1000,
      cost: 400,
    });
    const productB = await addProduct({
      sku: "REPORT-002",
      name: "レポート商品B",
      price: 2000,
      cost: 800,
    });

    const client = getClient();

    // 受注1: 4/10 商品A x 3 = 3000
    const ord1Id = generateId();
    await client.batch([
      {
        sql: "INSERT INTO orders (id, customer_name, total_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        args: [ord1Id, "顧客A", 3000, "2026-04-10 10:00:00", "2026-04-10 10:00:00"],
      },
      {
        sql: "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        args: [generateId(), ord1Id, productA.id, 3, 1000, 3000],
      },
      {
        sql: "INSERT INTO transactions (id, type, amount, reference_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [generateId(), "sale", 3000, "order", ord1Id, "2026-04-10 10:00:00"],
      },
    ]);

    // 受注2: 4/10 商品B x 2 = 4000
    const ord2Id = generateId();
    await client.batch([
      {
        sql: "INSERT INTO orders (id, customer_name, total_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        args: [ord2Id, "顧客B", 4000, "2026-04-10 15:00:00", "2026-04-10 15:00:00"],
      },
      {
        sql: "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        args: [generateId(), ord2Id, productB.id, 2, 2000, 4000],
      },
      {
        sql: "INSERT INTO transactions (id, type, amount, reference_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [generateId(), "sale", 4000, "order", ord2Id, "2026-04-10 15:00:00"],
      },
    ]);

    // 受注3: 4/15 商品A x 5 + 商品B x 1 = 7000
    const ord3Id = generateId();
    await client.batch([
      {
        sql: "INSERT INTO orders (id, customer_name, total_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        args: [ord3Id, "顧客C", 7000, "2026-04-15 09:00:00", "2026-04-15 09:00:00"],
      },
      {
        sql: "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        args: [generateId(), ord3Id, productA.id, 5, 1000, 5000],
      },
      {
        sql: "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        args: [generateId(), ord3Id, productB.id, 1, 2000, 2000],
      },
      {
        sql: "INSERT INTO transactions (id, type, amount, reference_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [generateId(), "sale", 7000, "order", ord3Id, "2026-04-15 09:00:00"],
      },
    ]);

    // レポート生成
    const report = await generateSalesReport("2026-04-01", "2026-04-30");

    // 日別集計の検証
    expect(report.by_date).toHaveLength(2);
    expect(report.by_date[0]!.date).toBe("2026-04-10");
    expect(report.by_date[0]!.total_sales).toBe(7000); // 3000 + 4000
    expect(report.by_date[0]!.transaction_count).toBe(2);
    expect(report.by_date[1]!.date).toBe("2026-04-15");
    expect(report.by_date[1]!.total_sales).toBe(7000);
    expect(report.by_date[1]!.transaction_count).toBe(1);

    // 商品別集計の検証
    expect(report.by_product).toHaveLength(2);
    const prodA = report.by_product.find((p) => p.product_id === productA.id)!;
    const prodB = report.by_product.find((p) => p.product_id === productB.id)!;
    expect(prodA.total_quantity).toBe(8);   // 3 + 5
    expect(prodA.total_sales).toBe(8000);   // 3000 + 5000
    expect(prodB.total_quantity).toBe(3);   // 2 + 1
    expect(prodB.total_sales).toBe(6000);   // 4000 + 2000

    // 合計の検証
    expect(report.grand_total).toBe(14000);
  });

  it("期間指定で対象取引が正しく絞り込まれる", async () => {
    const product = await addProduct({
      sku: "RANGE-001",
      name: "期間テスト商品",
      price: 1000,
      cost: 500,
    });

    const client = getClient();

    // 3月の取引
    const ord1Id = generateId();
    await client.batch([
      {
        sql: "INSERT INTO orders (id, customer_name, total_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        args: [ord1Id, "3月顧客", 1000, "2026-03-15 10:00:00", "2026-03-15 10:00:00"],
      },
      {
        sql: "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        args: [generateId(), ord1Id, product.id, 1, 1000, 1000],
      },
      {
        sql: "INSERT INTO transactions (id, type, amount, reference_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [generateId(), "sale", 1000, "order", ord1Id, "2026-03-15 10:00:00"],
      },
    ]);

    // 4月の取引
    const ord2Id = generateId();
    await client.batch([
      {
        sql: "INSERT INTO orders (id, customer_name, total_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        args: [ord2Id, "4月顧客", 2000, "2026-04-10 10:00:00", "2026-04-10 10:00:00"],
      },
      {
        sql: "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        args: [generateId(), ord2Id, product.id, 2, 1000, 2000],
      },
      {
        sql: "INSERT INTO transactions (id, type, amount, reference_type, reference_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [generateId(), "sale", 2000, "order", ord2Id, "2026-04-10 10:00:00"],
      },
    ]);

    // 4月のみ
    const aprilReport = await generateSalesReport("2026-04-01", "2026-04-30");
    expect(aprilReport.grand_total).toBe(2000);
    expect(aprilReport.by_product[0]!.total_quantity).toBe(2);

    // 3月のみ
    const marchReport = await generateSalesReport("2026-03-01", "2026-03-31");
    expect(marchReport.grand_total).toBe(1000);

    // 全期間
    const allReport = await generateSalesReport("2026-01-01", "2026-12-31");
    expect(allReport.grand_total).toBe(3000);
  });

  it("在庫評価が原価ベースで正しく算出される", async () => {
    const productA = await addProduct({
      sku: "VAL-001",
      name: "評価商品A",
      price: 1500,
      cost: 600,
    });
    const productB = await addProduct({
      sku: "VAL-002",
      name: "評価商品B",
      price: 3000,
      cost: 1200,
    });

    // 入庫
    await stockIn({ product_id: productA.id, warehouse_id: "wh-1", quantity: 50 });
    await stockIn({ product_id: productA.id, warehouse_id: "wh-2", quantity: 30 });
    await stockIn({ product_id: productB.id, warehouse_id: "wh-1", quantity: 20 });

    // 一部出庫
    await stockOut({ product_id: productA.id, warehouse_id: "wh-1", quantity: 10 });

    // 在庫評価
    const valuation = await calculateInventoryValue();

    // productA: (50-10 + 30) * 600 = 42000
    // productB: 20 * 1200 = 24000
    const valA = valuation.items.find((i) => i.product_id === productA.id)!;
    const valB = valuation.items.find((i) => i.product_id === productB.id)!;

    expect(valA.total_quantity).toBe(70); // 40 + 30
    expect(valA.total_value).toBe(42000);
    expect(valB.total_quantity).toBe(20);
    expect(valB.total_value).toBe(24000);
    expect(valuation.total_value).toBe(66000);
  });

  it("購入と返金の取引が正しく記録される", async () => {
    // 仕入れ取引
    const purchase = await recordTransaction({
      type: "purchase",
      amount: -50000,
      description: "4月仕入れ",
    });
    expect(purchase.type).toBe("purchase");
    expect(purchase.amount).toBe(-50000);

    // 売上取引
    const sale = await recordTransaction({
      type: "sale",
      amount: 30000,
      reference_type: "order",
      reference_id: "ord-1",
      description: "テスト商事向け",
    });
    expect(sale.type).toBe("sale");

    // 返金取引
    const refund = await recordTransaction({
      type: "refund",
      amount: -5000,
      reference_type: "order",
      reference_id: "ord-1",
      description: "一部返品",
    });
    expect(refund.type).toBe("refund");

    // 全取引が記録されている
    const client = getClient();
    const result = await client.execute(
      "SELECT type, amount FROM transactions ORDER BY created_at",
    );
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]!["type"]).toBe("purchase");
    expect(result.rows[1]!["type"]).toBe("sale");
    expect(result.rows[2]!["type"]).toBe("refund");
  });
});
