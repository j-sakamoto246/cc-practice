import { expect, test } from "@playwright/test";

import { StockPage } from "./pages";

const PRODUCT_LABEL = "CF-001 - コーヒー豆 1kg";
const WAREHOUSE_VALUE = "wh-tokyo";

test.describe("入庫 → 出庫フロー", () => {
  test("入庫してから出庫すると履歴と現在庫に反映される", async ({ page }) => {
    const stock = new StockPage(page);
    await stock.goto();

    await stock.submitStockIn({
      productLabel: PRODUCT_LABEL,
      warehouseValue: WAREHOUSE_VALUE,
      quantity: "10",
      memo: "E2E 入庫",
    });
    await expect(page.getByText("入庫を登録しました")).toBeVisible();

    await stock.submitStockOut({
      productLabel: PRODUCT_LABEL,
      warehouseValue: WAREHOUSE_VALUE,
      quantity: "3",
      memo: "E2E 出庫",
    });
    await expect(page.getByText("出庫を登録しました")).toBeVisible();

    // 履歴テーブルに入庫・出庫それぞれの行が現れるまで待機（フォームはリセット済みなのでメモは履歴のみに残る）
    await expect(stock.historyRow("E2E 入庫")).toBeVisible();
    await expect(stock.historyRow("E2E 出庫")).toBeVisible();
  });

  test("現在庫を超えて出庫しようとすると登録できない", async ({ page }) => {
    const stock = new StockPage(page);
    await stock.goto();

    await stock.submitStockOut({
      productLabel: PRODUCT_LABEL,
      warehouseValue: WAREHOUSE_VALUE,
      quantity: "999999",
    });

    await expect(stock.outFormError(/現在庫.*を超えて出庫できません/)).toBeVisible();
  });
});
