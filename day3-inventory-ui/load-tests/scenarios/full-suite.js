// フルスイート: 3 シナリオを並列実行
// ピーク時 100 VU × 3 = 300 VU 相当

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, stages, thresholds, summaryTrendStats } from "../lib/config.js";
import { buildStockInPayload, buildStockOutPayload, buildOrderPayload } from "../lib/data.js";

export { handleSummary } from "../lib/summary.js";

export const options = {
  summaryTrendStats,
  thresholds,
  scenarios: {
    products: {
      executor: "ramping-vus",
      exec: "products",
      stages,
      startTime: "0s",
      gracefulRampDown: "10s",
    },
    stock: {
      executor: "ramping-vus",
      exec: "stock",
      stages,
      startTime: "0s",
      gracefulRampDown: "10s",
    },
    orders: {
      executor: "ramping-vus",
      exec: "orders",
      stages,
      startTime: "0s",
      gracefulRampDown: "10s",
    },
  },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export function products() {
  const res = http.get(`${BASE_URL}/api/products`, {
    tags: { op: "read", endpoint: "products" },
  });
  check(res, {
    "products: status 200": (r) => r.status === 200,
    "products: non-empty": (r) => (r.json("products") || []).length > 0,
  });
  sleep(1);
}

export function stock() {
  const payload = Math.random() < 0.7 ? buildStockInPayload() : buildStockOutPayload();
  const res = http.post(`${BASE_URL}/api/stock`, JSON.stringify(payload), {
    headers: JSON_HEADERS,
    tags: { op: "write", endpoint: "stock", stock_type: payload.type },
  });
  check(res, {
    "stock: status 201": (r) => r.status === 201,
    "stock: movement.id": (r) => !!r.json("movement.id"),
  });
  sleep(1);
}

export function orders() {
  const payload = buildOrderPayload();
  const res = http.post(`${BASE_URL}/api/orders`, JSON.stringify(payload), {
    headers: JSON_HEADERS,
    tags: { op: "write", endpoint: "orders" },
  });
  check(res, {
    "orders: status 201": (r) => r.status === 201,
    "orders: order.id": (r) => !!r.json("order.id"),
  });
  sleep(1);
}
