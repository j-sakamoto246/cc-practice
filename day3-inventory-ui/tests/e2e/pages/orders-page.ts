import type { Locator, Page } from "@playwright/test";

export type NewOrderInput = {
  customerName: string;
  productLabel: string;
  quantity: string;
};

export class OrdersPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newOrderButton: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1, name: "受注管理" });
    this.newOrderButton = page.getByRole("button", { name: "新規受注" });
    this.searchInput = page.getByPlaceholder("顧客名で検索");
  }

  async goto() {
    await this.page.goto("/orders");
  }

  async createOrder(input: NewOrderInput): Promise<Locator> {
    await this.newOrderButton.click();
    const dialog = this.page.getByRole("dialog", { name: "新規受注" });
    await dialog.getByLabel("顧客名").fill(input.customerName);
    await dialog.getByLabel("商品 1").selectOption({ label: input.productLabel });
    await dialog.getByLabel("数量 1").fill(input.quantity);
    await dialog.getByRole("button", { name: "作成", exact: true }).click();
    return dialog;
  }

  async filterByCustomer(name: string) {
    await this.searchInput.fill(name);
  }

  rowMatching(text: string): Locator {
    return this.page.getByRole("row").filter({ hasText: text });
  }

  async openDetail(row: Locator): Promise<Locator> {
    await row.getByRole("button", { name: "受注詳細" }).click();
    return this.page.getByRole("dialog", { name: "受注詳細" });
  }

  async changeStatus(detailDialog: Locator, value: string) {
    await detailDialog.locator("select").selectOption(value);
  }

  async openShipDialog(detailDialog: Locator): Promise<Locator> {
    await detailDialog.getByRole("button", { name: "発送処理" }).click();
    return this.page.getByRole("dialog", { name: "発送処理" });
  }

  async submitShipment(shipDialog: Locator, trackingNumber: string) {
    await shipDialog.getByLabel("追跡番号").fill(trackingNumber);
    await shipDialog.getByRole("button", { name: "発送登録" }).click();
  }
}
