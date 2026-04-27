import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  calculateInventoryValue,
  exportToCSV,
  generateSalesReport,
} from "../../modules/accounting.js";
import { errorResponses } from "../schemas/common.js";

const SalesReportItemSchema = z.object({
  date: z.string(),
  total_sales: z.number(),
  transaction_count: z.number().int(),
});

const ProductSalesItemSchema = z.object({
  product_id: z.string(),
  product_name: z.string(),
  total_quantity: z.number(),
  total_sales: z.number(),
});

const SalesReportSchema = z
  .object({
    start_date: z.string(),
    end_date: z.string(),
    by_date: z.array(SalesReportItemSchema),
    by_product: z.array(ProductSalesItemSchema),
    grand_total: z.number(),
  })
  .openapi("SalesReport");

const InventoryValueItemSchema = z.object({
  product_id: z.string(),
  product_name: z.string(),
  sku: z.string(),
  cost: z.number(),
  total_quantity: z.number(),
  total_value: z.number(),
});

const InventoryValuationSchema = z
  .object({
    items: z.array(InventoryValueItemSchema),
    total_value: z.number(),
  })
  .openapi("InventoryValuation");

const DateRangeQuery = z.object({
  from: z.string().openapi({ example: "2026-01-01" }),
  to: z.string().openapi({ example: "2026-12-31" }),
});

export const accountingRoutes = new OpenAPIHono();

const reportRoute = createRoute({
  method: "get",
  path: "/accounting/report",
  tags: ["accounting"],
  summary: "売上レポート",
  security: [{ ApiKeyAuth: [] }],
  request: { query: DateRangeQuery },
  responses: {
    200: {
      description: "売上レポート",
      content: { "application/json": { schema: SalesReportSchema } },
    },
    ...errorResponses,
  },
});
accountingRoutes.openapi(reportRoute, async (c) => {
  const { from, to } = c.req.valid("query");
  const report = await generateSalesReport(from, to);
  return c.json(report, 200);
});

const inventoryValueRoute = createRoute({
  method: "get",
  path: "/accounting/inventory-value",
  tags: ["accounting"],
  summary: "在庫評価",
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: "在庫評価",
      content: { "application/json": { schema: InventoryValuationSchema } },
    },
    ...errorResponses,
  },
});
accountingRoutes.openapi(inventoryValueRoute, async (c) => {
  const valuation = await calculateInventoryValue();
  return c.json(valuation, 200);
});

const exportRoute = createRoute({
  method: "get",
  path: "/accounting/export",
  tags: ["accounting"],
  summary: "売上データを CSV で取得",
  security: [{ ApiKeyAuth: [] }],
  request: { query: DateRangeQuery },
  responses: {
    200: {
      description: "CSV データ",
      content: { "text/csv": { schema: z.string() } },
    },
    ...errorResponses,
  },
});
accountingRoutes.openapi(exportRoute, async (c) => {
  const { from, to } = c.req.valid("query");
  const report = await generateSalesReport(from, to);
  const csv = exportToCSV(
    ["日付", "売上", "件数"],
    report.by_date.map((d) => [d.date, d.total_sales, d.transaction_count]),
  );
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
  });
});
