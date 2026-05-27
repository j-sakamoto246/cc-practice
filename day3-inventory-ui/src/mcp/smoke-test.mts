import { spawn } from "node:child_process";

type JsonRpc = {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

const child = spawn("npx", ["tsx", "src/mcp/server.ts"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, DATABASE_URL: "file:./data/inventory.db" },
});

const pending = new Map<number, (msg: JsonRpc) => void>();
let buffer = "";

child.stdout.on("data", (chunk: Buffer) => {
  buffer += chunk.toString("utf8");
  let idx: number;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg: JsonRpc;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error("non-JSON:", line);
      continue;
    }
    if (typeof msg.id === "number" && pending.has(msg.id)) {
      pending.get(msg.id)!(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function request(method: string, params?: unknown): Promise<JsonRpc> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
function notify(method: string, params?: unknown): void {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

async function main() {
  const init = await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0.0.1" },
  });
  console.log("[initialize]", JSON.stringify(init.result, null, 2).slice(0, 300));
  notify("notifications/initialized");

  const tools = await request("tools/list");
  const list = (tools.result as { tools: Array<{ name: string }> }).tools;
  console.log(`[tools/list] ${list.length} tools:`, list.map((t) => t.name).join(", "));

  const listProducts = await request("tools/call", { name: "list_products", arguments: {} });
  console.log("[list_products]", JSON.stringify(listProducts.result).slice(0, 400));

  const bogus = await request("tools/call", {
    name: "get_stock_status",
    arguments: { product_id: "does-not-exist", warehouse_id: "does-not-exist" },
  });
  console.log("[get_stock_status missing]", JSON.stringify(bogus.result).slice(0, 400));

  const overdraw = await request("tools/call", {
    name: "stock_out",
    arguments: { product_id: "does-not-exist", warehouse_id: "does-not-exist", quantity: 999999 },
  });
  console.log("[stock_out error]", JSON.stringify(overdraw.result).slice(0, 400));

  child.kill();
}

main().catch((e) => {
  console.error("smoke-test failed:", e);
  child.kill();
  process.exit(1);
});
