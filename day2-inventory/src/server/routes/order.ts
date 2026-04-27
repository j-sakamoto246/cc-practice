import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  createOrder,
  getOrderDetail,
  listOrders,
  shipOrder,
} from "../../modules/order.js";
import { errorResponses } from "../schemas/common.js";
import { resolveProductBySku } from "../resolvers.js";

const OrderSchema = z
  .object({
    id: z.string(),
    customer_name: z.string(),
    status: z.string(),
    total_amount: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("Order");

const OrderItemSchema = z
  .object({
    id: z.string(),
    order_id: z.string(),
    product_id: z.string(),
    quantity: z.number().int(),
    unit_price: z.number(),
    subtotal: z.number(),
  })
  .openapi("OrderItem");

const ShipmentSchema = z
  .object({
    id: z.string(),
    order_id: z.string(),
    tracking_number: z.string(),
    carrier: z.string(),
    status: z.string(),
    shipped_at: z.string().nullable(),
    delivered_at: z.string().nullable(),
  })
  .openapi("Shipment");

const OrderDetailSchema = OrderSchema.extend({
  items: z.array(OrderItemSchema),
  shipments: z.array(ShipmentSchema),
}).openapi("OrderDetail");

const CreateOrderItemInputSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
});

const CreateOrderRequestSchema = z
  .object({
    customer_name: z.string().min(1),
    items: z.array(CreateOrderItemInputSchema).min(1),
    warehouse_id: z.string().optional(),
  })
  .openapi("CreateOrderRequest");

const ShipOrderRequestSchema = z
  .object({
    carrier: z.string().min(1),
    tracking_number: z.string().min(1),
  })
  .openapi("ShipOrderRequest");

const OrdersListQuery = z.object({
  status: z.string().optional(),
  customer: z.string().optional(),
});

const OrderIdParam = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});

export const orderRoutes = new OpenAPIHono();

const createOrderRoute = createRoute({
  method: "post",
  path: "/orders",
  tags: ["order"],
  summary: "受注を作成",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateOrderRequestSchema } } },
  },
  responses: {
    201: {
      description: "作成された受注",
      content: { "application/json": { schema: OrderDetailSchema } },
    },
    ...errorResponses,
  },
});
orderRoutes.openapi(createOrderRoute, async (c) => {
  const body = c.req.valid("json");

  const items = [];
  for (const item of body.items) {
    const product = await resolveProductBySku(item.sku);
    items.push({
      product_id: product.id,
      quantity: item.quantity,
      unit_price: product.price,
    });
  }

  const order = await createOrder({
    customer_name: body.customer_name,
    items,
    warehouse_id: body.warehouse_id,
  });

  const detail = await getOrderDetail(order.id);
  return c.json(detail!, 201);
});

const listOrdersRoute = createRoute({
  method: "get",
  path: "/orders",
  tags: ["order"],
  summary: "受注一覧",
  security: [{ ApiKeyAuth: [] }],
  request: { query: OrdersListQuery },
  responses: {
    200: {
      description: "受注一覧",
      content: { "application/json": { schema: z.array(OrderSchema) } },
    },
    ...errorResponses,
  },
});
orderRoutes.openapi(listOrdersRoute, async (c) => {
  const { status, customer } = c.req.valid("query");
  let orders = await listOrders();
  if (status) {
    orders = orders.filter((o) => o.status === status);
  }
  if (customer) {
    orders = orders.filter((o) => o.customer_name.includes(customer));
  }
  return c.json(orders, 200);
});

const getOrderRoute = createRoute({
  method: "get",
  path: "/orders/{id}",
  tags: ["order"],
  summary: "受注詳細",
  security: [{ ApiKeyAuth: [] }],
  request: { params: OrderIdParam },
  responses: {
    200: {
      description: "受注詳細",
      content: { "application/json": { schema: OrderDetailSchema } },
    },
    ...errorResponses,
  },
});
orderRoutes.openapi(getOrderRoute, async (c) => {
  const { id } = c.req.valid("param");
  const detail = await getOrderDetail(id);
  if (!detail) {
    throw new Error(`受注が見つかりません: ${id}`);
  }
  return c.json(detail, 200);
});

const shipOrderRoute = createRoute({
  method: "post",
  path: "/orders/{id}/ship",
  tags: ["order"],
  summary: "受注を出荷",
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: OrderIdParam,
    body: { content: { "application/json": { schema: ShipOrderRequestSchema } } },
  },
  responses: {
    201: {
      description: "出荷情報",
      content: { "application/json": { schema: ShipmentSchema } },
    },
    ...errorResponses,
  },
});
orderRoutes.openapi(shipOrderRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const shipment = await shipOrder(id, body.carrier, body.tracking_number);
  return c.json(shipment, 201);
});
