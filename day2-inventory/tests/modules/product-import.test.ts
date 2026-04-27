import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import { getProductBySku } from "../../src/modules/product.js";
import {
  importProductsFromCsv,
  parseProductCsv,
} from "../../src/modules/product-import.js";

describe("product import module", () => {
  describe("parseProductCsv", () => {
    it("商品CSVをパースできる", () => {
      const rows = parseProductCsv(
        [
          "sku,name,price,cost,description,min_quantity",
          'SKU-001,"テスト, 商品",1000,500,"説明 ""A""",3',
        ].join("\n"),
      );

      expect(rows).toEqual([
        {
          rowNumber: 2,
          sku: "SKU-001",
          name: "テスト, 商品",
          price: 1000,
          cost: 500,
          description: '説明 "A"',
          minQuantity: 3,
        },
      ]);
    });

    it("任意カラムを省略した場合はデフォルト値を使う", () => {
      const rows = parseProductCsv(["sku,name,price", "SKU-001,商品A,1000"].join("\n"));

      expect(rows[0]).toMatchObject({
        sku: "SKU-001",
        name: "商品A",
        price: 1000,
        cost: 0,
        description: "",
        minQuantity: 0,
      });
    });

    it("必須カラムがない場合はエラーになる", () => {
      expect(() => parseProductCsv("sku,name\nSKU-001,商品A")).toThrow(
        "CSVに必須カラムがありません: price",
      );
    });

    it("数値カラムが不正な場合は行番号付きでエラーになる", () => {
      expect(() => parseProductCsv("sku,name,price\nSKU-001,商品A,-1")).toThrow(
        "CSVのpriceは0以上の数値を指定してください: 2行目",
      );
    });
  });

  describe("importProductsFromCsv", () => {
    it("CSVファイルから商品を一括登録できる", async () => {
      const filePath = await createCsvFile(
        [
          "sku,name,price,cost,description,min_quantity",
          "SKU-001,商品A,1000,500,説明A,2",
          "SKU-002,商品B,2000,800,説明B,0",
        ].join("\n"),
      );

      const result = await importProductsFromCsv(filePath);

      expect(result).toEqual({ imported: 2 });
      await expect(getProductBySku("SKU-001")).resolves.toMatchObject({
        sku: "SKU-001",
        name: "商品A",
        price: 1000,
        cost: 500,
        description: "説明A",
        min_quantity: 2,
      });
      await expect(getProductBySku("SKU-002")).resolves.toMatchObject({
        sku: "SKU-002",
        name: "商品B",
      });
    });

    it("CSV内でSKUが重複している場合は登録しない", async () => {
      const filePath = await createCsvFile(
        ["sku,name,price", "SKU-001,商品A,1000", "SKU-001,商品B,2000"].join("\n"),
      );

      await expect(importProductsFromCsv(filePath)).rejects.toThrow(
        "CSV内でSKUが重複しています: SKU-001 (2行目と3行目)",
      );
      await expect(getProductBySku("SKU-001")).resolves.toBeNull();
    });
  });
});

async function createCsvFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "inventory-import-"));
  const filePath = join(dir, "products.csv");
  await writeFile(filePath, content, "utf8");
  return filePath;
}
