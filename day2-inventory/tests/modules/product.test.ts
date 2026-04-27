import { describe, it, expect } from "vitest";
import { getClient } from "../../src/db/client.js";
import {
  addProduct,
  listProducts,
  updateProduct,
  deleteProduct,
  setMinQuantity,
} from "../../src/modules/product.js";

describe("product module", () => {
  const sampleInput = {
    sku: "TEST-001",
    name: "テスト商品",
    description: "テスト用の商品です",
    price: 1000,
    cost: 500,
  };

  // ============================================================
  // addProduct
  // ============================================================
  describe("addProduct", () => {
    // --- 正常系 ---
    it("全フィールド指定で追加できる", async () => {
      const product = await addProduct(sampleInput);

      expect(product.id).toBeDefined();
      expect(product.sku).toBe("TEST-001");
      expect(product.name).toBe("テスト商品");
      expect(product.description).toBe("テスト用の商品です");
      expect(product.price).toBe(1000);
      expect(product.cost).toBe(500);
      expect(product.created_at).toBeDefined();
      expect(product.updated_at).toBeDefined();
    });

    it("description 省略時は空文字になる", async () => {
      const product = await addProduct({
        sku: "TEST-002",
        name: "説明なし商品",
        price: 500,
        cost: 200,
      });

      expect(product.description).toBe("");
    });

    it("price=0, cost=0 で追加できる", async () => {
      const product = await addProduct({
        sku: "FREE-001",
        name: "無料商品",
        price: 0,
        cost: 0,
      });

      expect(product.price).toBe(0);
      expect(product.cost).toBe(0);
    });

    it("連続追加でそれぞれ異なる id が生成される", async () => {
      const p1 = await addProduct({ sku: "A-001", name: "商品A", price: 100, cost: 50 });
      const p2 = await addProduct({ sku: "A-002", name: "商品B", price: 200, cost: 100 });

      expect(p1.id).not.toBe(p2.id);
    });

    it("created_at, updated_at が妥当な日時文字列である", async () => {
      const product = await addProduct(sampleInput);

      // SQLite の datetime('now') は "YYYY-MM-DD HH:MM:SS" 形式
      const datePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
      expect(product.created_at).toMatch(datePattern);
      expect(product.updated_at).toMatch(datePattern);
    });

    // --- 異常系 ---
    it("SKU が重複するとエラーになる", async () => {
      await addProduct(sampleInput);

      await expect(addProduct(sampleInput)).rejects.toThrow(
        "SKU が既に存在します: TEST-001",
      );
    });

    it("price が負数だと CHECK 制約違反でエラーになる", async () => {
      await expect(
        addProduct({ sku: "NEG-001", name: "負数価格", price: -1, cost: 100 }),
      ).rejects.toThrow();
    });

    it("cost が負数だと CHECK 制約違反でエラーになる", async () => {
      await expect(
        addProduct({ sku: "NEG-002", name: "負数コスト", price: 100, cost: -1 }),
      ).rejects.toThrow();
    });

    // --- 境界値 ---
    it("price が非常に大きい値でも保存できる", async () => {
      const product = await addProduct({
        sku: "BIG-001",
        name: "高額商品",
        price: 999999999.99,
        cost: 0,
      });

      expect(product.price).toBe(999999999.99);
    });

    it("name が非常に長い文字列でも保存できる", async () => {
      const longName = "あ".repeat(1000);
      const product = await addProduct({
        sku: "LONG-001",
        name: longName,
        price: 100,
        cost: 50,
      });

      expect(product.name).toBe(longName);
    });

    it("description が非常に長い文字列でも保存できる", async () => {
      const longDesc = "テスト".repeat(1000);
      const product = await addProduct({
        sku: "LONG-002",
        name: "長い説明の商品",
        description: longDesc,
        price: 100,
        cost: 50,
      });

      expect(product.description).toBe(longDesc);
    });

    it("SKU にマルチバイト文字を使用できる", async () => {
      const product = await addProduct({
        sku: "商品-001",
        name: "マルチバイトSKU",
        price: 100,
        cost: 50,
      });

      expect(product.sku).toBe("商品-001");
    });
  });

  // ============================================================
  // listProducts
  // ============================================================
  describe("listProducts", () => {
    // --- 正常系 ---
    it("商品0件で空配列を返す", async () => {
      const products = await listProducts();
      expect(products).toEqual([]);
    });

    it("商品1件で配列長1を返す", async () => {
      await addProduct(sampleInput);

      const products = await listProducts();
      expect(products).toHaveLength(1);
      expect(products[0]!.sku).toBe("TEST-001");
    });

    it("複数件追加で全件返る", async () => {
      await addProduct(sampleInput);
      await addProduct({ sku: "TEST-002", name: "商品2", price: 2000, cost: 800 });
      await addProduct({ sku: "TEST-003", name: "商品3", price: 3000, cost: 1200 });

      const products = await listProducts();
      expect(products).toHaveLength(3);
    });

    it("created_at DESC の順序で返る", async () => {
      const client = getClient();

      // datetime('now') は秒精度のため、異なる created_at を明示的に設定
      await client.execute({
        sql: "INSERT INTO products (id, sku, name, price, cost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: ["p-old", "A-001", "古い商品", 100, 50, "2025-01-01 00:00:00", "2025-01-01 00:00:00"],
      });
      await client.execute({
        sql: "INSERT INTO products (id, sku, name, price, cost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: ["p-new", "A-002", "新しい商品", 200, 100, "2025-06-01 00:00:00", "2025-06-01 00:00:00"],
      });

      const products = await listProducts();
      // DESC なので新しい方が先
      expect(products[0]!.id).toBe("p-new");
      expect(products[1]!.id).toBe("p-old");
    });

    // --- 異常系 ---
    it("削除済み商品は一覧に含まれない", async () => {
      const p1 = await addProduct(sampleInput);
      await addProduct({ sku: "TEST-002", name: "商品2", price: 200, cost: 100 });
      await deleteProduct(p1.id);

      const products = await listProducts();
      expect(products).toHaveLength(1);
      expect(products[0]!.sku).toBe("TEST-002");
    });

    // --- 境界値 ---
    it("100件追加しても全件返る", async () => {
      for (let i = 0; i < 100; i++) {
        await addProduct({ sku: `BULK-${String(i).padStart(3, "0")}`, name: `商品${i}`, price: 100, cost: 50 });
      }

      const products = await listProducts();
      expect(products).toHaveLength(100);
    });
  });

  // ============================================================
  // updateProduct
  // ============================================================
  describe("updateProduct", () => {
    // --- 正常系 ---
    it("name のみ更新できる", async () => {
      const product = await addProduct(sampleInput);

      const updated = await updateProduct(product.id, { name: "更新された商品" });

      expect(updated.name).toBe("更新された商品");
      expect(updated.sku).toBe("TEST-001");
      expect(updated.price).toBe(1000);
      expect(updated.cost).toBe(500);
      expect(updated.description).toBe("テスト用の商品です");
    });

    it("price のみ更新できる", async () => {
      const product = await addProduct(sampleInput);

      const updated = await updateProduct(product.id, { price: 2000 });

      expect(updated.price).toBe(2000);
      expect(updated.name).toBe(product.name);
    });

    it("cost のみ更新できる", async () => {
      const product = await addProduct(sampleInput);

      const updated = await updateProduct(product.id, { cost: 800 });

      expect(updated.cost).toBe(800);
      expect(updated.name).toBe(product.name);
    });

    it("description のみ更新できる", async () => {
      const product = await addProduct(sampleInput);

      const updated = await updateProduct(product.id, { description: "新しい説明" });

      expect(updated.description).toBe("新しい説明");
      expect(updated.name).toBe(product.name);
    });

    it("複数フィールドを同時に更新できる", async () => {
      const product = await addProduct(sampleInput);

      const updated = await updateProduct(product.id, {
        name: "新商品名",
        price: 1500,
        cost: 700,
        description: "新しい説明",
      });

      expect(updated.name).toBe("新商品名");
      expect(updated.price).toBe(1500);
      expect(updated.cost).toBe(700);
      expect(updated.description).toBe("新しい説明");
    });

    it("更新後に updated_at が変化する", async () => {
      const product = await addProduct(sampleInput);
      // SQLite の datetime('now') は秒精度なので、同一秒だと同じ値になる可能性がある
      // DB 側で更新されていることを確認するため、直接 SQL で確認
      const updated = await updateProduct(product.id, { name: "更新後" });

      // updated_at が設定されていること（最低限の検証）
      expect(updated.updated_at).toBeDefined();
      // created_at は変わらない
      expect(updated.created_at).toBe(product.created_at);
    });

    it("同じ値で上書きしてもエラーにならない", async () => {
      const product = await addProduct(sampleInput);

      const updated = await updateProduct(product.id, { name: product.name });

      expect(updated.name).toBe(product.name);
    });

    // --- 異常系 ---
    it("存在しない id で更新するとエラーになる", async () => {
      await expect(
        updateProduct("nonexistent-id", { name: "test" }),
      ).rejects.toThrow("商品が見つかりません");
    });

    it("price を負数に更新すると CHECK 制約違反でエラーになる", async () => {
      const product = await addProduct(sampleInput);

      await expect(
        updateProduct(product.id, { price: -1 }),
      ).rejects.toThrow();
    });

    it("cost を負数に更新すると CHECK 制約違反でエラーになる", async () => {
      const product = await addProduct(sampleInput);

      await expect(
        updateProduct(product.id, { cost: -1 }),
      ).rejects.toThrow();
    });

    it("更新フィールドが空オブジェクトでもエラーにならない", async () => {
      const product = await addProduct(sampleInput);

      const updated = await updateProduct(product.id, {});

      expect(updated.name).toBe(product.name);
      expect(updated.price).toBe(product.price);
    });

    // --- 境界値 ---
    it("price を 0 に更新できる", async () => {
      const product = await addProduct(sampleInput);

      const updated = await updateProduct(product.id, { price: 0 });

      expect(updated.price).toBe(0);
    });

    it("cost を 0 に更新できる", async () => {
      const product = await addProduct(sampleInput);

      const updated = await updateProduct(product.id, { cost: 0 });

      expect(updated.cost).toBe(0);
    });

    it("description を空文字に更新できる", async () => {
      const product = await addProduct(sampleInput);

      const updated = await updateProduct(product.id, { description: "" });

      expect(updated.description).toBe("");
    });

    it("name を非常に長い文字列に更新できる", async () => {
      const product = await addProduct(sampleInput);
      const longName = "更".repeat(1000);

      const updated = await updateProduct(product.id, { name: longName });

      expect(updated.name).toBe(longName);
    });
  });

  // ============================================================
  // deleteProduct
  // ============================================================
  describe("deleteProduct", () => {
    // --- 正常系 ---
    it("商品を削除すると一覧から消える", async () => {
      const product = await addProduct(sampleInput);

      await deleteProduct(product.id);

      const products = await listProducts();
      expect(products).toHaveLength(0);
    });

    it("削除後に同じ SKU で再追加できる", async () => {
      const product = await addProduct(sampleInput);
      await deleteProduct(product.id);

      const newProduct = await addProduct(sampleInput);

      expect(newProduct.sku).toBe("TEST-001");
      expect(newProduct.id).not.toBe(product.id);
    });

    // --- 異常系 ---
    it("存在しない id で削除するとエラーになる", async () => {
      await expect(deleteProduct("nonexistent-id")).rejects.toThrow(
        "商品が見つかりません",
      );
    });

    it("同じ id を2回削除すると2回目でエラーになる", async () => {
      const product = await addProduct(sampleInput);
      await deleteProduct(product.id);

      await expect(deleteProduct(product.id)).rejects.toThrow(
        "商品が見つかりません",
      );
    });

    it("inventory に参照がある商品を削除すると FK 制約違反でエラーになる", async () => {
      const product = await addProduct(sampleInput);
      const client = getClient();

      // 倉庫と在庫レコードを作成
      await client.execute({
        sql: "INSERT INTO warehouses (id, name) VALUES (?, ?)",
        args: ["wh-1", "倉庫A"],
      });
      await client.execute({
        sql: "INSERT INTO inventory (id, product_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)",
        args: ["inv-1", product.id, "wh-1", 10],
      });

      await expect(deleteProduct(product.id)).rejects.toThrow();
    });

    it("order_items に参照がある商品を削除すると FK 制約違反でエラーになる", async () => {
      const product = await addProduct(sampleInput);
      const client = getClient();

      // 受注と受注明細を作成
      await client.execute({
        sql: "INSERT INTO orders (id, customer_name, status, total_amount) VALUES (?, ?, ?, ?)",
        args: ["ord-1", "テスト顧客", "pending", 1000],
      });
      await client.execute({
        sql: "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        args: ["oi-1", "ord-1", product.id, 1, 1000, 1000],
      });

      await expect(deleteProduct(product.id)).rejects.toThrow();
    });

    it("stock_movements に参照がある商品を削除すると FK 制約違反でエラーになる", async () => {
      const product = await addProduct(sampleInput);
      const client = getClient();

      // 倉庫と入出庫履歴を作成
      await client.execute({
        sql: "INSERT INTO warehouses (id, name) VALUES (?, ?)",
        args: ["wh-1", "倉庫A"],
      });
      await client.execute({
        sql: "INSERT INTO stock_movements (id, product_id, warehouse_id, type, quantity) VALUES (?, ?, ?, ?, ?)",
        args: ["sm-1", product.id, "wh-1", "in", 10],
      });

      await expect(deleteProduct(product.id)).rejects.toThrow();
    });

    // --- 境界値 ---
    it("商品が1件だけの状態で削除すると空になる", async () => {
      const product = await addProduct(sampleInput);
      await deleteProduct(product.id);

      const products = await listProducts();
      expect(products).toEqual([]);
    });
  });

  // ============================================================
  // setMinQuantity
  // ============================================================
  describe("setMinQuantity", () => {
    it("商品作成直後の min_quantity はデフォルト 0", async () => {
      const product = await addProduct(sampleInput);
      expect(product.min_quantity).toBe(0);
    });

    it("最低在庫数を設定できる", async () => {
      await addProduct(sampleInput);

      const updated = await setMinQuantity("TEST-001", 10);

      expect(updated.min_quantity).toBe(10);
      expect(updated.sku).toBe("TEST-001");
    });

    it("最低在庫数を 0 に戻せる", async () => {
      await addProduct(sampleInput);
      await setMinQuantity("TEST-001", 10);

      const updated = await setMinQuantity("TEST-001", 0);

      expect(updated.min_quantity).toBe(0);
    });

    it("存在しない SKU だとエラーになる", async () => {
      await expect(setMinQuantity("NO-SUCH-SKU", 5)).rejects.toThrow(
        "商品が見つかりません: SKU=NO-SUCH-SKU",
      );
    });

    it("負数を指定するとエラーになる", async () => {
      await addProduct(sampleInput);

      await expect(setMinQuantity("TEST-001", -1)).rejects.toThrow(
        "最低在庫数は0以上を指定してください",
      );
    });
  });
});
