import { describe, expect, it } from "vitest";

import { parseProductCsv } from "./product-import";

describe("parseProductCsv", () => {
  it("必須カラムが揃った CSV をパースする", () => {
    const csv = [
      "sku,name,price,cost,description,min_quantity",
      "ABC-1,商品A,1000,500,説明,10",
    ].join("\n");

    const rows = parseProductCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      sku: "ABC-1",
      name: "商品A",
      price: 1000,
      cost: 500,
      description: "説明",
      minQuantity: 10,
    });
  });

  it("オプション列が無くても price のみ必須で動く", () => {
    const csv = "sku,name,price\nXYZ-9,商品X,800";
    const rows = parseProductCsv(csv);
    expect(rows[0]).toMatchObject({
      sku: "XYZ-9",
      name: "商品X",
      price: 800,
      cost: 0,
      minQuantity: 0,
    });
  });

  it("必須カラムが無いとエラー", () => {
    const csv = "sku,name\nABC,商品";
    expect(() => parseProductCsv(csv)).toThrow(/CSVに必須カラムがありません: price/);
  });

  it("price が負数だとエラー (行番号を含む)", () => {
    const csv = "sku,name,price\nABC,商品,-1";
    expect(() => parseProductCsv(csv)).toThrow(/2行目/);
  });

  it("空 CSV はエラー", () => {
    expect(() => parseProductCsv("")).toThrow(/CSVファイルが空です/);
  });
});
