import { z } from "@hono/zod-openapi";

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "bad_request" }),
      message: z.string().openapi({ example: "リクエストが不正です" }),
    }),
  })
  .openapi("ErrorResponse");

export const errorResponses = {
  400: {
    description: "リクエストが不正",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  401: {
    description: "認証失敗",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  404: {
    description: "リソースが存在しない",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  409: {
    description: "状態の競合（在庫不足・重複など）",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
  500: {
    description: "サーバーエラー",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
} as const;
