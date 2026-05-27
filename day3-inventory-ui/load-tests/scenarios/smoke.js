// スモークテスト: 1 VU / 30s で 3 エンドポイントの疎通確認
// 負荷試験本番の前段として失敗しないことだけを保証する。

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL } from "../lib/config.js";
import { buildStockInPayload, buildOrderPayload } from "../lib/data.js";

export { handleSummary } from "../lib/summary.js";

export const options = {
  vus: 1,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function () {
  const products = http.get(`${BASE_URL}/api/products`, {
    tags: { op: "read", endpoint: "products" },
  });
  check(products, {
    "GET /api/products is 200": (r) => r.status === 200,
    "GET /api/products has products[]": (r) => Array.isArray(r.json("products")),
  });

  const stock = http.post(`${BASE_URL}/api/stock`, JSON.stringify(buildStockInPayload()), {
    headers: JSON_HEADERS,
    tags: { op: "write", endpoint: "stock" },
  });
  check(stock, {
    "POST /api/stock is 201": (r) => r.status === 201,
    "POST /api/stock returns movement.id": (r) => !!r.json("movement.id"),
  });

  const order = http.post(`${BASE_URL}/api/orders`, JSON.stringify(buildOrderPayload(1)), {
    headers: JSON_HEADERS,
    tags: { op: "write", endpoint: "orders" },
  });
  check(order, {
    "POST /api/orders is 201": (r) => r.status === 201,
    "POST /api/orders returns order.id": (r) => !!r.json("order.id"),
  });

  sleep(1);
}
