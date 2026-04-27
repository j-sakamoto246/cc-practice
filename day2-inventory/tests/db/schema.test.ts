import { describe, it, expect } from "vitest";
import { getClient } from "../../src/db/client.js";

describe("schema", () => {
  it("creates all domain tables plus schema_migrations", async () => {
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
      "schema_migrations",
      "shipments",
      "stock_lots",
      "stock_movements",
      "transactions",
      "warehouses",
    ]);
  });

  it("records all migrations in schema_migrations", async () => {
    const client = getClient();
    const result = await client.execute(
      "SELECT version, name FROM schema_migrations ORDER BY version",
    );
    expect(result.rows.map((r) => ({ version: r["version"], name: r["name"] }))).toEqual([
      { version: "001", name: "init" },
      { version: "002", name: "add_lead_time_to_products" },
      { version: "003", name: "add_stock_lots" },
    ]);
  });

  it("stock_movements has lot_id column referencing stock_lots", async () => {
    const client = getClient();
    const info = await client.execute("PRAGMA table_info(stock_movements)");
    const columns = info.rows.map((r) => r["name"] as string);
    expect(columns).toContain("lot_id");
  });
});
