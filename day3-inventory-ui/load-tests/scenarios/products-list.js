// 商品一覧 (GET /api/products) の負荷シナリオ
// 10 → 50 → 100 VU で段階加重。

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, commonOptions } from "../lib/config.js";

export { handleSummary } from "../lib/summary.js";

export const options = commonOptions;

export default function () {
  const res = http.get(`${BASE_URL}/api/products`, {
    tags: { op: "read", endpoint: "products" },
  });
  check(res, {
    "status is 200": (r) => r.status === 200,
    "products is array": (r) => Array.isArray(r.json("products")),
    "products is non-empty": (r) => (r.json("products") || []).length > 0,
  });
  sleep(1);
}
