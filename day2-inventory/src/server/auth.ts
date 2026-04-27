import type { MiddlewareHandler } from "hono";

export const API_KEY_HEADER = "x-api-key";

export function apiKeyAuth(): MiddlewareHandler {
  return async (c, next) => {
    const expected = process.env["API_KEY"];
    if (!expected) {
      return c.json(
        {
          error: {
            code: "server_misconfigured",
            message: "API_KEY 環境変数が設定されていません",
          },
        },
        500,
      );
    }

    const provided = c.req.header(API_KEY_HEADER);
    if (provided !== expected) {
      return c.json(
        {
          error: {
            code: "unauthorized",
            message: "API キーが無効です",
          },
        },
        401,
      );
    }

    await next();
  };
}
