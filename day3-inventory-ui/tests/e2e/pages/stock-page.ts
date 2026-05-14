import type { Locator, Page } from "@playwright/test";

export type StockMovementInput = {
  productLabel: string;
  warehouseValue: string;
  quantity: string;
  memo?: string;
};

export class StockPage {
  readonly page: Page;
  readonly inForm: Locator;
  readonly outForm: Locator;
  readonly historyCard: Locator;

  constructor(page: Page) {
    this.page = page;
    this.inForm = page.locator("form").filter({ has: page.locator("#in-quantity") });
    this.outForm = page.locator("form").filter({ has: page.locator("#out-quantity") });
    this.historyCard = page
      .locator('[data-slot="card"]')
      .filter({ has: page.locator('[data-slot="card-title"]', { hasText: "入出庫履歴" }) });
  }

  async goto() {
    await this.page.goto("/stock");
  }

  async submitStockIn(input: StockMovementInput) {
    await this.inForm.locator("#in-product").fill(input.productLabel);
    await this.inForm.locator("#in-warehouse").selectOption(input.warehouseValue);
    await this.inForm.locator("#in-quantity").fill(input.quantity);
    if (input.memo !== undefined) {
      await this.inForm.locator("#in-memo").fill(input.memo);
    }
    await this.inForm.getByRole("button", { name: /登録/ }).click();
  }

  async submitStockOut(input: StockMovementInput) {
    await this.outForm.locator("#out-product").fill(input.productLabel);
    await this.outForm.locator("#out-warehouse").selectOption(input.warehouseValue);
    await this.outForm.locator("#out-quantity").fill(input.quantity);
    if (input.memo !== undefined) {
      await this.outForm.locator("#out-memo").fill(input.memo);
    }
    await this.outForm.getByRole("button", { name: /登録/ }).click();
  }

  outFormError(pattern: RegExp): Locator {
    return this.outForm.getByText(pattern);
  }

  historyRow(memo: string): Locator {
    return this.historyCard.getByText(memo);
  }
}
