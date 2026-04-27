import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { forecastProducts, type ProductForecast } from "../modules/forecast.js";
import { formatTable } from "../utils/formatter.js";
import { logger } from "../utils/logger.js";

interface ForecastCliOptions {
  sku?: string;
  warehouseId?: string;
  days: number;
  confidence: number;
  orderCost: number;
  holdingRate: number;
  csv: string;
}

export function registerForecastCommands(parent: Command) {
  parent
    .command("forecast")
    .description("需要予測と発注推奨を出力（移動平均・安全在庫・EOQ）")
    .option("--sku <sku>", "対象 SKU（省略時は全商品）")
    .option("--warehouse-id <id>", "対象倉庫ID（省略時は全倉庫合算）")
    .option("--days <n>", "ルックバック日数", (v) => parseInt(v, 10), 30)
    .option(
      "--confidence <c>",
      "信頼水準 0.80|0.85|0.90|0.95|0.99",
      parseFloat,
      0.95,
    )
    .option("--order-cost <s>", "1回あたり発注コスト（円）", parseFloat, 1000)
    .option(
      "--holding-rate <h>",
      "年間保管コスト率（原価に対する比率）",
      parseFloat,
      0.2,
    )
    .option("--csv <path>", "CSV 出力先パス", "forecast.csv")
    .action(async (opts: ForecastCliOptions) => {
      const forecasts = await forecastProducts({
        sku: opts.sku,
        warehouseId: opts.warehouseId,
        days: opts.days,
        confidence: opts.confidence,
        orderCost: opts.orderCost,
        holdingRate: opts.holdingRate,
      });

      if (forecasts.length === 0) {
        console.log("対象商品がありません");
        return;
      }

      printReport(forecasts, opts);

      const csv = buildCsv(forecasts);
      await writeFile(opts.csv, csv, "utf8");
      logger.info(`CSV を出力しました: ${opts.csv}`);
    });
}

function printReport(forecasts: ProductForecast[], opts: ForecastCliOptions): void {
  const head = forecasts[0]!;
  console.log("# 需要予測レポート\n");
  console.log(
    `- 期間: ${head.start_date} 〜 ${head.end_date} (${opts.days}日)`,
  );
  console.log(
    `- 信頼水準: ${(opts.confidence * 100).toFixed(0)}% (z=${head.z_score.toFixed(3)})`,
  );
  console.log(
    `- 発注コスト: ${opts.orderCost} 円 / 年間保管コスト率: ${(opts.holdingRate * 100).toFixed(1)}%`,
  );
  console.log(`- 倉庫: ${opts.warehouseId ?? "全倉庫合算"}\n`);

  console.log("## サマリー\n");
  const headers = [
    "SKU",
    "商品名",
    "現在庫",
    "平均/日",
    "SD",
    "L(日)",
    "安全在庫",
    "発注点",
    "EOQ",
    "推奨発注量",
  ];
  const rows = forecasts.map((f) => [
    f.sku,
    f.name,
    String(f.on_hand),
    f.avg_daily_demand.toFixed(2),
    f.std_daily_demand.toFixed(2),
    String(f.lead_time_days),
    f.safety_stock.toFixed(1),
    f.reorder_point.toFixed(1),
    f.eoq.toFixed(1),
    f.recommended_order.toFixed(1),
  ]);
  console.log(formatTable(headers, rows));
  console.log("");

  console.log("## グラフ\n");
  console.log(buildMermaid(forecasts, Boolean(opts.sku)));
  console.log("");
}

function buildMermaid(forecasts: ProductForecast[], single: boolean): string {
  if (single && forecasts.length === 1) {
    return buildTimeSeriesChart(forecasts[0]!);
  }
  return buildRecommendationChart(forecasts);
}

function buildTimeSeriesChart(f: ProductForecast): string {
  const labels = f.daily_series.map((p) => `"${p.date.slice(5)}"`).join(", ");
  const demands = f.daily_series.map((p) => p.demand).join(", ");
  const avgLine = f.daily_series.map(() => f.avg_daily_demand.toFixed(2)).join(", ");
  const upperLine = f.daily_series.map(() => f.upper_ci.toFixed(2)).join(", ");
  const lowerLine = f.daily_series.map(() => f.lower_ci.toFixed(2)).join(", ");
  const peak = Math.max(...f.daily_series.map((p) => p.demand), f.upper_ci, 1);
  const yMax = Math.ceil(peak * 1.1);

  return [
    "```mermaid",
    "xychart-beta",
    `    title "${escapeTitle(f.sku)} ${escapeTitle(f.name)} - 日次需要 (mean / +z·σ / -z·σ)"`,
    `    x-axis [${labels}]`,
    `    y-axis "数量" 0 --> ${yMax}`,
    `    bar [${demands}]`,
    `    line [${avgLine}]`,
    `    line [${upperLine}]`,
    `    line [${lowerLine}]`,
    "```",
  ].join("\n");
}

function buildRecommendationChart(forecasts: ProductForecast[]): string {
  const candidates = forecasts
    .filter((f) => f.recommended_order > 0)
    .sort((a, b) => b.recommended_order - a.recommended_order)
    .slice(0, 20);

  if (candidates.length === 0) {
    return "_発注推奨の商品はありません（グラフ省略）_";
  }

  const labels = candidates.map((f) => `"${escapeTitle(f.sku)}"`).join(", ");
  const values = candidates.map((f) => f.recommended_order.toFixed(0)).join(", ");
  const peak = Math.max(...candidates.map((f) => f.recommended_order), 1);
  const yMax = Math.ceil(peak * 1.1);

  return [
    "```mermaid",
    "xychart-beta",
    `    title "推奨発注量（上位${candidates.length}件）"`,
    `    x-axis [${labels}]`,
    `    y-axis "推奨発注量" 0 --> ${yMax}`,
    `    bar [${values}]`,
    "```",
  ].join("\n");
}

function escapeTitle(s: string): string {
  return s.replace(/"/g, "'");
}

function buildCsv(forecasts: ProductForecast[]): string {
  const lines = [
    "sku,date,daily_demand,moving_avg,upper_ci,lower_ci,safety_stock,reorder_point,eoq,recommended_order",
  ];
  for (const f of forecasts) {
    for (const p of f.daily_series) {
      lines.push(
        [
          csvEscape(f.sku),
          p.date,
          String(p.demand),
          f.avg_daily_demand.toFixed(4),
          f.upper_ci.toFixed(4),
          f.lower_ci.toFixed(4),
          f.safety_stock.toFixed(4),
          f.reorder_point.toFixed(4),
          f.eoq.toFixed(4),
          f.recommended_order.toFixed(4),
        ].join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
