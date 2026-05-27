import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listProducts } from "../modules/product";
import { getStockAlerts, getStockStatus, stockIn, stockOut } from "../modules/stock";
import { InsufficientStockError } from "../errors/insufficient-stock";
import { TimeoutError, withTimeout } from "./timeout";

const HANDLER_TIMEOUT_MS = Number(process.env.MCP_HANDLER_TIMEOUT_MS ?? 5000);

type ErrorResult = {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
};

function toErrorResult(err: unknown): ErrorResult {
  let message: string;
  if (err instanceof InsufficientStockError) {
    message = `在庫不足: 現在庫=${err.currentQuantity}, 要求=${err.requestedQuantity}`;
  } else if (err instanceof TimeoutError) {
    message = `処理がタイムアウトしました (${err.ms}ms)`;
  } else if (err instanceof Error) {
    message = err.message;
  } else {
    message = String(err);
  }
  return { isError: true, content: [{ type: "text", text: message }] };
}

function jsonContent(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

export function registerInventoryTools(server: McpServer): void {
  server.registerTool(
    "list_products",
    {
      title: "製品一覧",
      description: "登録済みの全製品を返す",
      inputSchema: {},
    },
    async () => {
      try {
        const products = await withTimeout(listProducts(), HANDLER_TIMEOUT_MS);
        return jsonContent({ products });
      } catch (e) {
        return toErrorResult(e);
      }
    },
  );

  server.registerTool(
    "get_stock_status",
    {
      title: "在庫数量取得",
      description: "指定した製品 ID と倉庫 ID の組み合わせの在庫数を返す",
      inputSchema: {
        product_id: z.string().min(1).describe("製品 ID"),
        warehouse_id: z.string().min(1).describe("倉庫 ID"),
      },
    },
    async ({ product_id, warehouse_id }) => {
      try {
        const status = await withTimeout(
          getStockStatus(product_id, warehouse_id),
          HANDLER_TIMEOUT_MS,
        );
        return jsonContent(status);
      } catch (e) {
        return toErrorResult(e);
      }
    },
  );

  server.registerTool(
    "list_low_stock",
    {
      title: "在庫不足アラート一覧",
      description: "最小在庫数を下回っている製品の一覧を返す",
      inputSchema: {},
    },
    async () => {
      try {
        const alerts = await withTimeout(getStockAlerts(), HANDLER_TIMEOUT_MS);
        return jsonContent({ alerts });
      } catch (e) {
        return toErrorResult(e);
      }
    },
  );

  server.registerTool(
    "stock_in",
    {
      title: "入庫登録",
      description: "指定の製品・倉庫に在庫を入庫する。ロット情報も指定可能",
      inputSchema: {
        product_id: z.string().min(1),
        warehouse_id: z.string().min(1),
        quantity: z.number().int().positive(),
        lot_code: z.string().min(1).optional(),
        expiry_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式で指定")
          .optional(),
      },
    },
    async (input) => {
      try {
        const movement = await withTimeout(stockIn(input), HANDLER_TIMEOUT_MS);
        return jsonContent({ movement });
      } catch (e) {
        return toErrorResult(e);
      }
    },
  );

  server.registerTool(
    "stock_out",
    {
      title: "出庫登録",
      description: "指定の製品・倉庫から在庫を出庫する。FIFO でロット引当を行う",
      inputSchema: {
        product_id: z.string().min(1),
        warehouse_id: z.string().min(1),
        quantity: z.number().int().positive(),
      },
    },
    async (input) => {
      try {
        const movement = await withTimeout(stockOut(input), HANDLER_TIMEOUT_MS);
        return jsonContent({ movement });
      } catch (e) {
        return toErrorResult(e);
      }
    },
  );
}
