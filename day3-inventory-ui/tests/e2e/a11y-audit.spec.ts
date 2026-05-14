import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

type PageDef = { path: string; name: string };

const pages: PageDef[] = [
  { path: "/", name: "ダッシュボード" },
  { path: "/products", name: "商品管理" },
  { path: "/stock", name: "在庫" },
  { path: "/stock/inventory", name: "在庫一覧" },
  { path: "/stock/lots", name: "ロット" },
  { path: "/stock/transfer", name: "倉庫間移動" },
  { path: "/orders", name: "受注管理" },
  { path: "/forecast", name: "需要予測" },
  { path: "/campaigns", name: "キャンペーン" },
  { path: "/reports", name: "レポート" },
];

test.describe("a11y audit (axe-core)", () => {
  for (const p of pages) {
    test(`${p.name} (${p.path}) に重大なアクセシビリティ違反がない`, async ({ page }) => {
      await page.goto(p.path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const offenders = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 5).map((n) => n.target.join(" > ")),
        html: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 200)),
      }));
      if (offenders.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`\n[a11y][${p.path}] ${offenders.length} violation(s):`);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(offenders, null, 2));
      }
      expect(offenders, `${offenders.length} violations on ${p.path}`).toEqual([]);
    });
  }
});
