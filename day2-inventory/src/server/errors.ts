import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { InsufficientStockError } from "../errors/insufficient-stock.js";

export interface ErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface MappedError {
  status: ContentfulStatusCode;
  body: ErrorBody;
}

export function mapError(err: unknown): MappedError {
  if (err instanceof InsufficientStockError) {
    return {
      status: 409,
      body: { error: { code: "insufficient_stock", message: err.message } },
    };
  }

  if (err instanceof Error) {
    const message = err.message;
    if (message.includes("が見つかりません")) {
      return {
        status: 404,
        body: { error: { code: "not_found", message } },
      };
    }
    if (message.includes("既に存在します")) {
      return {
        status: 409,
        body: { error: { code: "conflict", message } },
      };
    }
    return {
      status: 400,
      body: { error: { code: "bad_request", message } },
    };
  }

  return {
    status: 500,
    body: { error: { code: "internal_error", message: "Internal server error" } },
  };
}

export function handleError(err: unknown, c: Context) {
  const { status, body } = mapError(err);
  return c.json(body, status);
}
