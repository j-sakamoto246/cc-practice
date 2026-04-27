import { serve } from "@hono/node-server";
import { initDatabase } from "../db/client.js";
import { createApp } from "./app.js";

export interface StartServerOptions {
  port: number;
  databaseUrl?: string;
}

export async function startServer(opts: StartServerOptions) {
  await initDatabase(opts.databaseUrl);
  const app = createApp();

  const server = serve({
    fetch: app.fetch,
    port: opts.port,
  });

  console.log(`API サーバを起動しました: http://localhost:${opts.port}`);
  console.log(`  Swagger UI:     http://localhost:${opts.port}/docs`);
  console.log(`  OpenAPI schema: http://localhost:${opts.port}/openapi.json`);

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      server.close();
      resolve();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
