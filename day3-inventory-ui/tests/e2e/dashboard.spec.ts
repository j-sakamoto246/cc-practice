import { expect, test } from "@playwright/test";

import { DashboardPage } from "./pages";

test.describe("ダッシュボード", () => {
  test("主要セクションが表示される", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.heading).toBeVisible();

    await expect(dashboard.summaryMetric("総商品数")).toBeVisible();
    await expect(dashboard.summaryMetric("総在庫数")).toBeVisible();
    await expect(dashboard.summaryMetric("在庫金額（原価ベース）")).toBeVisible();

    await expect(dashboard.cardTitle("最近の入出庫")).toBeVisible();
    await expect(dashboard.cardTitle("在庫アラート")).toBeVisible();
    await expect(dashboard.cardTitle("売上グラフ")).toBeVisible();
  });

  test("ナビゲーションから各ページへ遷移できる", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await dashboard.navLink("商品管理").click();
    await expect(page).toHaveURL(/\/products$/);

    await dashboard.navLink("在庫").click();
    await expect(page).toHaveURL(/\/stock/);

    await dashboard.navLink("受注管理").click();
    await expect(page).toHaveURL(/\/orders$/);
  });
});
