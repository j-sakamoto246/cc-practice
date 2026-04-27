import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { apiKeyAuth } from "./auth.js";
import { handleError } from "./errors.js";
import { productRoutes } from "./routes/product.js";
import { stockRoutes } from "./routes/stock.js";
import { orderRoutes } from "./routes/order.js";
import { campaignRoutes } from "./routes/campaign.js";
import { accountingRoutes } from "./routes/accounting.js";
import { importRoutes } from "./routes/import.js";

export function createApp() {
  const app = new OpenAPIHono();

  app.openAPIRegistry.registerComponent("securitySchemes", "ApiKeyAuth", {
    type: "apiKey",
    name: "X-API-Key",
    in: "header",
  });

  app.onError((err, c) => handleError(err, c));

  app.get("/health", (c) => c.json({ status: "ok" }, 200));

  app.use("/api/*", apiKeyAuth());

  app.route("/api/v1", productRoutes);
  app.route("/api/v1", stockRoutes);
  app.route("/api/v1", orderRoutes);
  app.route("/api/v1", campaignRoutes);
  app.route("/api/v1", accountingRoutes);
  app.route("/api/v1", importRoutes);

  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "Inventory API",
      version: "1.1.0",
      description: "在庫管理システムの REST API",
    },
    servers: [{ url: "/" }],
  });

  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  return app;
}

export type AppType = ReturnType<typeof createApp>;
