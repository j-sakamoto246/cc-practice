import { expect, test } from "@playwright/test";

import { ProductsPage } from "./pages";

test.describe("商品追加フロー", () => {
  test("ダイアログから商品を追加すると一覧に表示される", async ({ page }) => {
    const sku = `E2E-${Date.now()}`;
    const name = `E2Eテスト商品 ${sku}`;

    const products = new ProductsPage(page);
    await products.goto();
    await expect(products.heading).toBeVisible();

    const dialog = await products.openAddDialog();
    await expect(dialog.getByRole("heading", { name: "商品を追加" })).toBeVisible();

    await products.fillAddForm(dialog, {
      sku,
      name,
      description: "Playwright が追加した商品",
      price: "1980",
      cost: "980",
      minQuantity: "5",
    });
    await products.submitAddForm(dialog);

    await expect(dialog).toBeHidden();
    await expect(page.getByText(`商品を追加しました: ${name}`)).toBeVisible();

    await products.filterBy(sku);

    const row = products.rowMatching(sku);
    await expect(row).toBeVisible();
    await expect(row.getByText(name)).toBeVisible();
  });

  test("必須項目が未入力だと追加できない", async ({ page }) => {
    const products = new ProductsPage(page);
    await products.goto();

    const dialog = await products.openAddDialog();
    await products.submitAddForm(dialog);

    // ダイアログは閉じない（HTML5 required で送信が止まる）
    await expect(dialog).toBeVisible();
  });
});
