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
      "stock_movements",
      "transactions",
      "warehouses",
    ]);
  });

  it("records 001_init in schema_migrations", async () => {
    const client = getClient();
    const result = await client.execute(
      "SELECT version, name FROM schema_migrations ORDER BY version",
    );
    expect(result.rows.map((r) => ({ version: r["version"], name: r["name"] }))).toEqual([
      { version: "001", name: "init" },
    ]);
  });
});
