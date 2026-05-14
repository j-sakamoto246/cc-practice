import type { Locator, Page } from "@playwright/test";

export type NewProductInput = {
  sku: string;
  name: string;
  description?: string;
  price: string;
  cost: string;
  minQuantity: string;
};

export class ProductsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly addButton: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1, name: "商品管理" });
    this.addButton = page.getByRole("button", { name: "商品を追加" });
    this.searchInput = page.getByPlaceholder("SKU・商品名・説明で絞り込み");
  }

  async goto() {
    await this.page.goto("/products");
  }

  async openAddDialog(): Promise<Locator> {
    await this.addButton.click();
    return this.page.getByRole("dialog");
  }

  async fillAddForm(dialog: Locator, input: NewProductInput) {
    await dialog.getByLabel("SKU").fill(input.sku);
    await dialog.getByLabel("商品名").fill(input.name);
    if (input.description !== undefined) {
      await dialog.getByLabel("説明").fill(input.description);
    }
    await dialog.getByLabel("価格").fill(input.price);
    await dialog.getByLabel("原価").fill(input.cost);
    await dialog.getByLabel("最低在庫数").fill(input.minQuantity);
  }

  async submitAddForm(dialog: Locator) {
    await dialog.getByRole("button", { name: "追加", exact: true }).click();
  }

  async filterBy(query: string) {
    await this.searchInput.fill(query);
  }

  rowMatching(text: string): Locator {
    return this.page.getByRole("row").filter({ hasText: text });
  }
}
