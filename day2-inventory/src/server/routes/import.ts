import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { importProductsFromCsvText } from "../../modules/product-import.js";
import { errorResponses } from "../schemas/common.js";

const ImportResultSchema = z
  .object({
    imported: z.number().int(),
  })
  .openapi("ImportProductsResult");

export const importRoutes = new OpenAPIHono();

const importProductsRoute = createRoute({
  method: "post",
  path: "/import/products",
  tags: ["import"],
  summary: "CSV から商品を一括インポート",
  description: "リクエストボディに CSV テキストを送信",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: {
        "text/csv": {
          schema: z.string().openapi({
            example: "sku,name,price\nSKU-001,商品A,1000",
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "インポート結果",
      content: { "application/json": { schema: ImportResultSchema } },
    },
    ...errorResponses,
  },
});
importRoutes.openapi(importProductsRoute, async (c) => {
  const text = await c.req.text();
  if (!text) {
    throw new Error("CSV ボディが空です");
  }
  const result = await importProductsFromCsvText(text);
  return c.json(result, 200);
});
