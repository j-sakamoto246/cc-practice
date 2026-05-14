import { expect, test } from "@playwright/test";

import { OrdersPage } from "./pages";

test.describe("受注 → 発送フロー", () => {
  test("受注作成 → confirmed → 発送処理でステータスが shipped になる", async ({ page }) => {
    const customerName = `E2E顧客 ${Date.now()}`;
    const trackingNumber = `TRK-${Date.now()}`;

    const orders = new OrdersPage(page);
    await orders.goto();
    await expect(orders.heading).toBeVisible();

    // 1) 新規受注ダイアログを開いて作成
    const createDialog = await orders.createOrder({
      customerName,
      productLabel: "CF-001 - コーヒー豆 1kg",
      quantity: "2",
    });

    await expect(page.getByText("受注を作成しました")).toBeVisible();
    await expect(createDialog).toBeHidden();

    // 2) 一覧から作成した受注を見つけて詳細を開く
    await orders.filterByCustomer(customerName);
    const row = orders.rowMatching(customerName);
    await expect(row).toBeVisible();
    await expect(row.getByText("未確定")).toBeVisible();

    const detailDialog = await orders.openDetail(row);
    await expect(detailDialog).toBeVisible();

    // 3) ステータスを confirmed に変更
    await orders.changeStatus(detailDialog, "confirmed");
    await expect(page.getByText("ステータスを変更しました")).toBeVisible();
    await expect(detailDialog.getByText("確定")).toBeVisible();

    // 4) 発送処理ダイアログを開いて追跡番号を登録
    const shipDialog = await orders.openShipDialog(detailDialog);
    await expect(shipDialog).toBeVisible();
    await orders.submitShipment(shipDialog, trackingNumber);

    await expect(page.getByText("発送処理を登録しました")).toBeVisible();
    await expect(shipDialog).toBeHidden();

    // 5) 詳細・一覧ともに shipped 状態
    await expect(detailDialog.getByText("発送済み")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detailDialog).toBeHidden();

    await expect(row.getByText("発送済み")).toBeVisible();
  });
});
