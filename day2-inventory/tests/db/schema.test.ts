import { describe, it, expect } from "vitest";
import { getClient } from "../../src/db/client.js";

describe("schema", () => {
  it("creates all 9 tables", async () => {
    const client = getClient();
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const tables = result.rows.map((r) => r["name"]);
    expect(tables).toEqual([
      "campaigns",
      "inventory",
      "order_items",
      "orders",
      "products",
      "shipments",
      "stock_movements",
      "transactions",
      "warehouses",
    ]);
  });
});
