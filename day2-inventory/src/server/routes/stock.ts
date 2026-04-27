import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  getAllStock,
  getStockAlerts,
  getStockStatus,
  stockIn,
  stockOut,
  stockTransfer,
} from "../../modules/stock.js";
import { setMinQuantity } from "../../modules/product.js";
import { errorResponses } from "../schemas/common.js";
import { resolveProductBySku, resolveWarehouseByName } from "../resolvers.js";

const StockMovementSchema = z
  .object({
    id: z.string(),
    product_id: z.string(),
    warehouse_id: z.string(),
    type: z.enum(["in", "out"]),
    quantity: z.number().int(),
    reference_type: z.string(),
    reference_id: z.string(),
    created_at: z.string(),
  })
  .openapi("StockMovement");

const StockInRequestSchema = z
  .object({
    sku: z.string().min(1),
    warehouse: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().optional(),
  })
  .openapi("StockInRequest");

const StockOutRequestSchema = z
  .object({
    sku: z.string().min(1),
    warehouse: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().optional(),
  })
  .openapi("StockOutRequest");

const StockTransferRequestSchema = z
  .object({
    sku: z.string().min(1),
    from_warehouse: z.string().min(1),
    to_warehouse: z.string().min(1),
    quantity: z.number().int().positive(),
    note: z.string().optional(),
  })
  .openapi("StockTransferRequest");

const StockTransferResponseSchema = z
  .object({
    out: StockMovementSchema,
    in: StockMovementSchema,
  })
  .openapi("StockTransferResponse");

const StockStatusItemSchema = z
  .object({
    product_id: z.string(),
    sku: z.string(),
    product_name: z.string(),
    warehouse_id: z.string(),
    warehouse_name: z.string(),
    quantity: z.number().int(),
  })
  .openapi("StockStatusItem");

const StockAlertSchema = z
  .object({
    product_id: z.string(),
    sku: z.string(),
    product_name: z.string(),
    total_quantity: z.number().int(),
    min_quantity: z.number().int(),
  })
  .openapi("StockAlert");

const ThresholdRequestSchema = z
  .object({
    sku: z.string().min(1),
    min_quantity: z.number().int().nonnegative(),
  })
  .openapi("StockThresholdRequest");

const StockStatusQuery = z.object({
  sku: z.string().optional(),
  warehouse: z.string().optional(),
});

export const stockRoutes = new OpenAPIHono();

const stockInRoute = createRoute({
  method: "post",
  path: "/stock/in",
  tags: ["stock"],
  summary: "入庫",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: StockInRequestSchema } } },
  },
  responses: {
    201: {
      description: "入庫履歴",
      content: { "application/json": { schema: StockMovementSchema } },
    },
    ...errorResponses,
  },
});
stockRoutes.openapi(stockInRoute, async (c) => {
  const body = c.req.valid("json");
  const product = await resolveProductBySku(body.sku);
  const warehouse = await resolveWarehouseByName(body.warehouse);
  const movement = await stockIn({
    product_id: product.id,
    warehouse_id: warehouse.id,
    quantity: body.quantity,
    reference_type: body.note ? "manual" : "",
    reference_id: body.note ?? "",
  });
  return c.json(movement, 201);
});

const stockOutRoute = createRoute({
  method: "post",
  path: "/stock/out",
  tags: ["stock"],
  summary: "出庫",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: StockOutRequestSchema } } },
  },
  responses: {
    201: {
      description: "出庫履歴",
      content: { "application/json": { schema: StockMovementSchema } },
    },
    ...errorResponses,
  },
});
stockRoutes.openapi(stockOutRoute, async (c) => {
  const body = c.req.valid("json");
  const product = await resolveProductBySku(body.sku);
  const warehouse = await resolveWarehouseByName(body.warehouse);
  const movement = await stockOut({
    product_id: product.id,
    warehouse_id: warehouse.id,
    quantity: body.quantity,
    reference_type: body.note ? "manual" : "",
    reference_id: body.note ?? "",
  });
  return c.json(movement, 201);
});

const stockTransferRoute = createRoute({
  method: "post",
  path: "/stock/transfer",
  tags: ["stock"],
  summary: "倉庫間在庫移動",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: StockTransferRequestSchema } } },
  },
  responses: {
    201: {
      description: "移動結果",
      content: { "application/json": { schema: StockTransferResponseSchema } },
    },
    ...errorResponses,
  },
});
stockRoutes.openapi(stockTransferRoute, async (c) => {
  const body = c.req.valid("json");
  const product = await resolveProductBySku(body.sku);
  const fromWarehouse = await resolveWarehouseByName(body.from_warehouse);
  const toWarehouse = await resolveWarehouseByName(body.to_warehouse);
  const result = await stockTransfer({
    product_id: product.id,
    from_warehouse_id: fromWarehouse.id,
    to_warehouse_id: toWarehouse.id,
    quantity: body.quantity,
    reference_type: body.note ? "manual_transfer" : "transfer",
    reference_id: body.note ?? "",
  });
  return c.json(result, 201);
});

const stockStatusRoute = createRoute({
  method: "get",
  path: "/stock",
  tags: ["stock"],
  summary: "在庫状況",
  security: [{ ApiKeyAuth: [] }],
  request: { query: StockStatusQuery },
  responses: {
    200: {
      description: "在庫一覧",
      content: { "application/json": { schema: z.array(StockStatusItemSchema) } },
    },
    ...errorResponses,
  },
});
stockRoutes.openapi(stockStatusRoute, async (c) => {
  const { sku, warehouse } = c.req.valid("query");

  if (sku && warehouse) {
    const product = await resolveProductBySku(sku);
    const wh = await resolveWarehouseByName(warehouse);
    const status = await getStockStatus(product.id, wh.id);
    return c.json(
      [
        {
          product_id: product.id,
          sku: product.sku,
          product_name: product.name,
          warehouse_id: wh.id,
          warehouse_name: wh.name,
          quantity: status.quantity,
        },
      ],
      200,
    );
  }

  const all = await getAllStock();
  const filtered = all.filter((s) => {
    if (sku && s.sku !== sku) return false;
    if (warehouse && s.warehouse_name !== warehouse) return false;
    return true;
  });
  return c.json(filtered, 200);
});

const setThresholdRoute = createRoute({
  method: "put",
  path: "/stock/threshold",
  tags: ["stock"],
  summary: "最低在庫数を設定",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: ThresholdRequestSchema } } },
  },
  responses: {
    200: {
      description: "更新後の商品",
      content: {
        "application/json": {
          schema: z.object({
            sku: z.string(),
            min_quantity: z.number().int(),
          }),
        },
      },
    },
    ...errorResponses,
  },
});
stockRoutes.openapi(setThresholdRoute, async (c) => {
  const body = c.req.valid("json");
  const updated = await setMinQuantity(body.sku, body.min_quantity);
  return c.json({ sku: updated.sku, min_quantity: updated.min_quantity }, 200);
});

const alertsRoute = createRoute({
  method: "get",
  path: "/stock/alerts",
  tags: ["stock"],
  summary: "最低在庫を下回っている商品",
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: "アラート一覧",
      content: { "application/json": { schema: z.array(StockAlertSchema) } },
    },
    ...errorResponses,
  },
});
stockRoutes.openapi(alertsRoute, async (c) => {
  const alerts = await getStockAlerts();
  return c.json(alerts, 200);
});
