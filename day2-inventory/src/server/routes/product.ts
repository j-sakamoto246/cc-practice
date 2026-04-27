import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  addProduct,
  deleteProduct,
  getProductBySku,
  listProducts,
  updateProduct,
} from "../../modules/product.js";
import { errorResponses } from "../schemas/common.js";

const ProductSchema = z
  .object({
    id: z.string(),
    sku: z.string(),
    name: z.string(),
    description: z.string(),
    price: z.number(),
    cost: z.number(),
    min_quantity: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("Product");

const CreateProductSchema = z
  .object({
    sku: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    price: z.number().nonnegative(),
    cost: z.number().nonnegative().default(0),
    minQuantity: z.number().int().nonnegative().optional(),
  })
  .openapi("CreateProductRequest");

const UpdateProductSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    price: z.number().nonnegative().optional(),
    cost: z.number().nonnegative().optional(),
  })
  .openapi("UpdateProductRequest");

const SkuParam = z.object({
  sku: z.string().openapi({ param: { name: "sku", in: "path" }, example: "SKU-001" }),
});

export const productRoutes = new OpenAPIHono();

const listRoute = createRoute({
  method: "get",
  path: "/products",
  tags: ["product"],
  summary: "商品一覧を取得",
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: "商品一覧",
      content: { "application/json": { schema: z.array(ProductSchema) } },
    },
    ...errorResponses,
  },
});
productRoutes.openapi(listRoute, async (c) => {
  const products = await listProducts();
  return c.json(products, 200);
});

const createProductRoute = createRoute({
  method: "post",
  path: "/products",
  tags: ["product"],
  summary: "商品を追加",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: CreateProductSchema } },
    },
  },
  responses: {
    201: {
      description: "作成された商品",
      content: { "application/json": { schema: ProductSchema } },
    },
    ...errorResponses,
  },
});
productRoutes.openapi(createProductRoute, async (c) => {
  const input = c.req.valid("json");
  const product = await addProduct(input);
  return c.json(product, 201);
});

const updateProductRoute = createRoute({
  method: "patch",
  path: "/products/{sku}",
  tags: ["product"],
  summary: "商品を更新",
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: SkuParam,
    body: {
      content: { "application/json": { schema: UpdateProductSchema } },
    },
  },
  responses: {
    200: {
      description: "更新された商品",
      content: { "application/json": { schema: ProductSchema } },
    },
    ...errorResponses,
  },
});
productRoutes.openapi(updateProductRoute, async (c) => {
  const { sku } = c.req.valid("param");
  const input = c.req.valid("json");
  const existing = await getProductBySku(sku);
  if (!existing) {
    throw new Error(`商品が見つかりません: SKU=${sku}`);
  }
  const updated = await updateProduct(existing.id, input);
  return c.json(updated, 200);
});

const deleteProductRoute = createRoute({
  method: "delete",
  path: "/products/{sku}",
  tags: ["product"],
  summary: "商品を削除",
  security: [{ ApiKeyAuth: [] }],
  request: { params: SkuParam },
  responses: {
    204: { description: "削除完了" },
    ...errorResponses,
  },
});
productRoutes.openapi(deleteProductRoute, async (c) => {
  const { sku } = c.req.valid("param");
  const existing = await getProductBySku(sku);
  if (!existing) {
    throw new Error(`商品が見つかりません: SKU=${sku}`);
  }
  await deleteProduct(existing.id);
  return c.body(null, 204);
});
