import { writeFileSync } from "node:fs";
import { Command } from "commander";
import {
  generateSalesReport,
  calculateInventoryValue,
  exportToCSV,
} from "../modules/accounting.js";
import { formatTable } from "../utils/formatter.js";

export function registerAccountingCommands(parent: Command) {
  const cmd = parent.command("accounting").description("会計処理");

  cmd
    .command("report")
    .description("売上レポート")
    .requiredOption("--from <date>", "開始日 (YYYY-MM-DD)")
    .requiredOption("--to <date>", "終了日 (YYYY-MM-DD)")
    .option("--format <format>", "出力形式 (table|json)", "table")
    .action(async (opts: { from: string; to: string; format: string }) => {
      const report = await generateSalesReport(opts.from, opts.to);

      if (opts.format === "json") {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      console.log(`売上レポート: ${report.start_date} 〜 ${report.end_date}`);
      console.log("");

      if (report.by_date.length > 0) {
        console.log("■ 日別売上:");
        console.log(
          formatTable(
            ["日付", "売上", "件数"],
            report.by_date.map((d) => [d.date, String(d.total_sales), String(d.transaction_count)]),
          ),
        );
        console.log("");
      }

      if (report.by_product.length > 0) {
        console.log("■ 商品別売上:");
        console.log(
          formatTable(
            ["商品名", "数量", "売上"],
            report.by_product.map((p) => [p.product_name, String(p.total_quantity), String(p.total_sales)]),
          ),
        );
        console.log("");
      }

      console.log(`合計: ${report.grand_total}円`);
    });

  cmd
    .command("inventory-value")
    .description("在庫評価")
    .action(async () => {
      const valuation = await calculateInventoryValue();

      if (valuation.items.length === 0) {
        console.log("在庫がありません");
        return;
      }

      console.log(
        formatTable(
          ["SKU", "商品名", "原価", "数量", "評価額"],
          valuation.items.map((i) => [
            i.sku,
            i.product_name,
            String(i.cost),
            String(i.total_quantity),
            String(i.total_value),
          ]),
        ),
      );
      console.log("");
      console.log(`在庫評価総額: ${valuation.total_value}円`);
    });

  cmd
    .command("export")
    .description("売上データをCSVエクスポート")
    .requiredOption("--from <date>", "開始日 (YYYY-MM-DD)")
    .requiredOption("--to <date>", "終了日 (YYYY-MM-DD)")
    .requiredOption("--output <path>", "出力ファイルパス")
    .action(async (opts: { from: string; to: string; output: string }) => {
      const report = await generateSalesReport(opts.from, opts.to);

      const csv = exportToCSV(
        ["日付", "売上", "件数"],
        report.by_date.map((d) => [d.date, d.total_sales, d.transaction_count]),
      );

      writeFileSync(opts.output, csv, "utf-8");
      console.log(`CSVを出力しました: ${opts.output} (${report.by_date.length}件)`);
    });
}
