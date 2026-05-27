// 在庫操作 (POST /api/stock): in 70% / out 30% を混在
// out の quantity は 1 固定で 409 (在庫不足) を回避。

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, commonOptions } from "../lib/config.js";
import { buildStockInPayload, buildStockOutPayload } from "../lib/data.js";

export { handleSummary } from "../lib/summary.js";

export const options = commonOptions;

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function () {
  const payload = Math.random() < 0.7 ? buildStockInPayload() : buildStockOutPayload();
  const res = http.post(`${BASE_URL}/api/stock`, JSON.stringify(payload), {
    headers: JSON_HEADERS,
    tags: { op: "write", endpoint: "stock", stock_type: payload.type },
  });
  check(res, {
    "status is 201": (r) => r.status === 201,
    "movement.id present": (r) => !!r.json("movement.id"),
    "movement.type matches": (r) => r.json("movement.type") === payload.type,
  });
  sleep(1);
}
