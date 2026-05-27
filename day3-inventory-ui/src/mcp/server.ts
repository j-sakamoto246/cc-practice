import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initDatabase } from "../db/client";
import { registerInventoryTools } from "./tools";

// stdio transport reserves stdout for JSON-RPC frames; route any console.log
// from the domain layer (e.g. src/utils/logger.ts) to stderr instead.
console.log = (...args: unknown[]) => console.error(...args);
console.info = (...args: unknown[]) => console.error(...args);

async function main() {
  await initDatabase();

  const server = new McpServer({
    name: "inventory-mcp",
    version: "0.1.0",
  });

  registerInventoryTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write("[inventory-mcp] ready on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`[inventory-mcp] fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
