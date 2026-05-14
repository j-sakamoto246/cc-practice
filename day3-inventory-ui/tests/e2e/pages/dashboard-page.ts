import type { Locator, Page } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly cardTitles: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1, name: "ダッシュボード" });
    this.cardTitles = page.locator('[data-slot="card-title"]');
  }

  async goto() {
    await this.page.goto("/");
  }

  summaryMetric(label: string): Locator {
    return this.page.getByText(label);
  }

  cardTitle(name: string): Locator {
    return this.cardTitles.filter({ hasText: name });
  }

  navLink(name: string): Locator {
    return this.page.getByRole("link", { name });
  }
}
