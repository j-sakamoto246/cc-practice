import { expect, test } from "@playwright/test";

test.describe("キーボードナビゲーション", () => {
  test("Tab でスキップリンク → ロゴ → ナビ → 主要コンテンツの順にフォーカスが進む", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("body").focus();

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "メインコンテンツへスキップ" });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press("Tab");
    const logoLink = page.getByRole("link", { name: /Inventory UI/ });
    await expect(logoLink).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /ダッシュボード/ }).first()).toBeFocused();
  });

  test("Enter でナビゲーションリンクを起動できる", async ({ page }) => {
    await page.goto("/");
    const productsLink = page.getByRole("link", { name: /商品管理/ }).first();
    await productsLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products$/);
  });

  test("Escape で受注作成ダイアログが閉じる", async ({ page }) => {
    await page.goto("/orders");
    const newButton = page.getByRole("button", { name: /新規受注/ });
    await newButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("heading", { name: /新規受注/ })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("ダイアログが開いた直後フォーカスがダイアログ内にある", async ({ page }) => {
    await page.goto("/orders");
    await page.getByRole("button", { name: /新規受注/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const focusedInside = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(focusedInside).toBe(true);
  });

  test("ダイアログを閉じるとトリガーボタンにフォーカスが戻る", async ({ page }) => {
    await page.goto("/orders");
    const newButton = page.getByRole("button", { name: /新規受注/ });
    await newButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(newButton).toBeFocused();
  });
});
