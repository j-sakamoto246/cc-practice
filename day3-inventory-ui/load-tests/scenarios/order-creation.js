// 受注作成 (POST /api/orders): items 1〜3 件をランダム生成

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, commonOptions } from "../lib/config.js";
import { buildOrderPayload } from "../lib/data.js";

export { handleSummary } from "../lib/summary.js";

export const options = commonOptions;

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function () {
  const payload = buildOrderPayload();
  const res = http.post(`${BASE_URL}/api/orders`, JSON.stringify(payload), {
    headers: JSON_HEADERS,
    tags: { op: "write", endpoint: "orders" },
  });
  check(res, {
    "status is 201": (r) => r.status === 201,
    "order.id present": (r) => !!r.json("order.id"),
    "order.items length matches": (r) =>
      (r.json("order.items") || []).length === payload.items.length,
  });
  sleep(1);
}
