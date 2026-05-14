import { getClient } from "../db/client";

const Z_TABLE: Record<string, number> = {
  "0.80": 1.282,
  "0.85": 1.44,
  "0.90": 1.645,
  "0.95": 1.96,
  "0.99": 2.576,
};

function zForConfidence(confidence: number): number {
  const key = confidence.toFixed(2);
  const z = Z_TABLE[key];
  if (z === undefined) {
    throw new Error(
      `サポートしていない信頼水準: ${confidence}. 0.80, 0.85, 0.90, 0.95, 0.99 のいずれかを指定してください`,
    );
  }
  return z;
}

export interface ForecastInput {
  sku?: string;
  warehouseId?: string;
  days: number;
  confidence: number;
  orderCost: number;
  holdingRate: number;
}

export interface DailyPoint {
  date: string;
  demand: number;
}

export interface ProductForecast {
  product_id: string;
  sku: string;
  name: string;
  cost: number;
  lead_time_days: number;
  on_hand: number;
  daily_series: DailyPoint[];
  avg_daily_demand: number;
  std_daily_demand: number;
  safety_stock: number;
  reorder_point: number;
  annual_demand: number;
  eoq: number;
  recommended_order: number;
  upper_ci: number;
  lower_ci: number;
  z_score: number;
  start_date: string;
  end_date: string;
}

export async function forecastProducts(input: ForecastInput): Promise<ProductForecast[]> {
  if (!Number.isInteger(input.days) || input.days <= 0) {
    throw new Error("days は1以上の整数を指定してください");
  }
  if (input.orderCost < 0) throw new Error("order-cost は0以上を指定してください");
  if (input.holdingRate < 0) throw new Error("holding-rate は0以上を指定してください");

  const client = getClient();
  const z = zForConfidence(input.confidence);

  const productsSql = input.sku
    ? "SELECT id, sku, name, cost, lead_time_days FROM products WHERE sku = ? ORDER BY sku"
    : "SELECT id, sku, name, cost, lead_time_days FROM products ORDER BY sku";
  const productArgs = input.sku ? [input.sku] : [];
  const productRows = (await client.execute({ sql: productsSql, args: productArgs })).rows;
  if (input.sku && productRows.length === 0) {
    throw new Error(`商品が見つかりません: SKU=${input.sku}`);
  }

  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (input.days - 1));
  const startStr = formatDate(start);
  const endStr = formatDate(end);

  const results: ProductForecast[] = [];
  for (const row of productRows) {
    const productId = row["id"] as string;
    const sku = row["sku"] as string;
    const name = row["name"] as string;
    const cost = row["cost"] as number;
    const leadTime = row["lead_time_days"] as number;

    const dailyMap = await loadDailyDemand(productId, input.warehouseId, startStr, endStr);
    const series = buildDailySeries(start, input.days, dailyMap);
    const demands = series.map((p) => p.demand);
    const avg = mean(demands);
    const sd = standardDeviation(demands);

    const safetyStock = z * sd * Math.sqrt(leadTime);
    const reorderPoint = avg * leadTime + safetyStock;
    const onHand = await loadOnHand(productId, input.warehouseId);

    const annualDemand = avg * 365;
    const annualHoldingCost = cost * input.holdingRate;
    const eoq =
      annualDemand > 0 && annualHoldingCost > 0
        ? Math.sqrt((2 * annualDemand * input.orderCost) / annualHoldingCost)
        : 0;

    const recommended =
      reorderPoint > 0 && onHand <= reorderPoint ? Math.max(reorderPoint - onHand, eoq) : 0;

    results.push({
      product_id: productId,
      sku,
      name,
      cost,
      lead_time_days: leadTime,
      on_hand: onHand,
      daily_series: series,
      avg_daily_demand: avg,
      std_daily_demand: sd,
      safety_stock: safetyStock,
      reorder_point: reorderPoint,
      annual_demand: annualDemand,
      eoq,
      recommended_order: recommended,
      upper_ci: avg + z * sd,
      lower_ci: Math.max(0, avg - z * sd),
      z_score: z,
      start_date: startStr,
      end_date: endStr,
    });
  }
  return results;
}

async function loadDailyDemand(
  productId: string,
  warehouseId: string | undefined,
  startStr: string,
  endStr: string,
): Promise<Map<string, number>> {
  const client = getClient();
  const sql = warehouseId
    ? `SELECT date(created_at) AS d, SUM(quantity) AS q
       FROM stock_movements
       WHERE product_id = ? AND warehouse_id = ? AND type = 'out'
         AND date(created_at) BETWEEN ? AND ?
       GROUP BY date(created_at)`
    : `SELECT date(created_at) AS d, SUM(quantity) AS q
       FROM stock_movements
       WHERE product_id = ? AND type = 'out'
         AND date(created_at) BETWEEN ? AND ?
       GROUP BY date(created_at)`;
  const args = warehouseId
    ? [productId, warehouseId, startStr, endStr]
    : [productId, startStr, endStr];

  const res = await client.execute({ sql, args });
  const map = new Map<string, number>();
  for (const r of res.rows) {
    map.set(r["d"] as string, Number(r["q"]));
  }
  return map;
}

async function loadOnHand(productId: string, warehouseId: string | undefined): Promise<number> {
  const client = getClient();
  const sql = warehouseId
    ? "SELECT COALESCE(SUM(quantity), 0) AS q FROM inventory WHERE product_id = ? AND warehouse_id = ?"
    : "SELECT COALESCE(SUM(quantity), 0) AS q FROM inventory WHERE product_id = ?";
  const args = warehouseId ? [productId, warehouseId] : [productId];
  const res = await client.execute({ sql, args });
  return Number(res.rows[0]!["q"]);
}

function buildDailySeries(start: Date, days: number, dailyMap: Map<string, number>): DailyPoint[] {
  const series: DailyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const ds = formatDate(d);
    series.push({ date: ds, demand: dailyMap.get(ds) ?? 0 });
  }
  return series;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function standardDeviation(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
