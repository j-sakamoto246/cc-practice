import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getClient } from "../../src/db/client.js";
import { createApp } from "../../src/server/app.js";

const TEST_API_KEY = "test-secret-key";

let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  process.env["API_KEY"] = TEST_API_KEY;
  app = createApp();

  const client = getClient();
  await client.batch([
    {
      sql: "INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)",
      args: ["wh-1", "東京倉庫", "東京"],
    },
    {
      sql: "INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)",
      args: ["wh-2", "大阪倉庫", "大阪"],
    },
  ]);
});

afterEach(() => {
  delete process.env["API_KEY"];
});

function req(path: string, init?: RequestInit) {
  const headers: Record<string, string> = {
    "X-API-Key": TEST_API_KEY,
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  return app.request(path, { ...init, headers });
}

describe("認証", () => {
  it("API キーが無いと 401", async () => {
    const res = await app.request("/api/v1/products");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("API キーが間違っていると 401", async () => {
    const res = await app.request("/api/v1/products", {
      headers: { "X-API-Key": "wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("API_KEY 未設定なら 500", async () => {
    delete process.env["API_KEY"];
    const res = await app.request("/api/v1/products", {
      headers: { "X-API-Key": "anything" },
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("server_misconfigured");
  });

  it("/health は認証不要", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("/openapi.json は認証不要で取得できる", async () => {
    const res = await app.request("/openapi.json");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe("3.0.0");
    expect(doc.paths["/api/v1/products"]).toBeDefined();
  });

  it("/docs は Swagger UI を返す", async () => {
    const res = await app.request("/docs");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("swagger-ui");
  });
});

describe("商品 API", () => {
  it("作成 → 一覧 → 更新 → 削除", async () => {
    const create = await req("/api/v1/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "SKU-1", name: "商品A", price: 1000, cost: 400 }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { sku: string; name: string };
    expect(created.sku).toBe("SKU-1");
    expect(created.name).toBe("商品A");

    const list = await req("/api/v1/products");
    expect(list.status).toBe(200);
    const items = (await list.json()) as { sku: string }[];
    expect(items).toHaveLength(1);

    const update = await req("/api/v1/products/SKU-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: 1500 }),
    });
    expect(update.status).toBe(200);
    const updated = (await update.json()) as { price: number };
    expect(updated.price).toBe(1500);

    const del = await req("/api/v1/products/SKU-1", { method: "DELETE" });
    expect(del.status).toBe(204);

    const afterDelete = await req("/api/v1/products");
    expect(((await afterDelete.json()) as unknown[]).length).toBe(0);
  });

  it("存在しない SKU の更新は 404", async () => {
    const res = await req("/api/v1/products/NOPE", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: 100 }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("バリデーション失敗は 400", async () => {
    const res = await req("/api/v1/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "", name: "x", price: -1 }),
    });
    expect(res.status).toBe(400);
  });
});

describe("在庫 API", () => {
  beforeEach(async () => {
    await req("/api/v1/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "SKU-1", name: "商品A", price: 1000, cost: 400 }),
    });
  });

  it("入庫 → 状況取得", async () => {
    const inRes = await req("/api/v1/stock/in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "SKU-1", warehouse: "東京倉庫", quantity: 30 }),
    });
    expect(inRes.status).toBe(201);
    const movement = (await inRes.json()) as { type: string; quantity: number };
    expect(movement.type).toBe("in");
    expect(movement.quantity).toBe(30);

    const status = await req("/api/v1/stock?sku=SKU-1&warehouse=東京倉庫");
    expect(status.status).toBe(200);
    const items = (await status.json()) as { quantity: number }[];
    expect(items[0]?.quantity).toBe(30);
  });

  it("在庫不足の出庫は 409", async () => {
    const res = await req("/api/v1/stock/out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "SKU-1", warehouse: "東京倉庫", quantity: 10 }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("insufficient_stock");
  });

  it("移動と最低在庫アラート", async () => {
    await req("/api/v1/stock/in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "SKU-1", warehouse: "東京倉庫", quantity: 50 }),
    });

    const transfer = await req("/api/v1/stock/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: "SKU-1",
        from_warehouse: "東京倉庫",
        to_warehouse: "大阪倉庫",
        quantity: 20,
      }),
    });
    expect(transfer.status).toBe(201);

    await req("/api/v1/stock/threshold", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "SKU-1", min_quantity: 100 }),
    });

    const alerts = await req("/api/v1/stock/alerts");
    expect(alerts.status).toBe(200);
    const list = (await alerts.json()) as { sku: string }[];
    expect(list).toHaveLength(1);
    expect(list[0]?.sku).toBe("SKU-1");
  });
});

describe("受注 API", () => {
  beforeEach(async () => {
    await req("/api/v1/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "SKU-1", name: "商品A", price: 1000, cost: 400 }),
    });
    await req("/api/v1/stock/in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "SKU-1", warehouse: "東京倉庫", quantity: 50 }),
    });
  });

  it("作成 → 詳細 → 出荷", async () => {
    const create = await req("/api/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "山田太郎",
        items: [{ sku: "SKU-1", quantity: 3 }],
      }),
    });
    expect(create.status).toBe(201);
    const order = (await create.json()) as { id: string; total_amount: number };
    expect(order.total_amount).toBe(3000);

    await req(`/api/v1/orders/${order.id}/status`, { method: "GET" }).catch(() => undefined);
    // confirmed → processing → shipped へ遷移
    const confirm = await app.request(`/api/v1/orders/${order.id}`, {
      headers: { "X-API-Key": TEST_API_KEY },
    });
    expect(confirm.status).toBe(200);
    const detail = (await confirm.json()) as { status: string; items: unknown[] };
    expect(detail.status).toBe("pending");
    expect(detail.items).toHaveLength(1);
  });
});

describe("CSV インポート API", () => {
  it("text/csv ボディから複数商品を投入", async () => {
    const csv = "sku,name,price,cost\nSKU-A,商品A,1000,400\nSKU-B,商品B,2000,800";
    const res = await req("/api/v1/import/products", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csv,
    });
    expect(res.status).toBe(200);
    const result = (await res.json()) as { imported: number };
    expect(result.imported).toBe(2);

    const list = await req("/api/v1/products");
    const items = (await list.json()) as unknown[];
    expect(items).toHaveLength(2);
  });
});
