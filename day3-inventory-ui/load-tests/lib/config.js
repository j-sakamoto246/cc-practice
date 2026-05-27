// 共通設定: BASE_URL / stages / thresholds
// 各シナリオはこれらを spread して上書き可能。

export const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3200";

// 10 → 50 → 100 VU の段階加重 (合計約 5.5 分)
export const stages = [
  { duration: "30s", target: 10 },
  { duration: "1m", target: 10 },
  { duration: "30s", target: 50 },
  { duration: "1m", target: 50 },
  { duration: "30s", target: 100 },
  { duration: "2m", target: 100 },
  { duration: "30s", target: 0 },
];

// SLO: p95 < 500ms、エラー率 < 1%
// op タグで read/write を区別し別閾値を設定
export const thresholds = {
  http_req_duration: ["p(95)<500"],
  "http_req_duration{op:read}": ["p(95)<300"],
  "http_req_duration{op:write}": ["p(95)<800"],
  http_req_failed: ["rate<0.01"],
  checks: ["rate>0.99"],
};

export const summaryTrendStats = ["min", "med", "avg", "p(90)", "p(95)", "p(99)", "max"];

// シナリオ単独実行用 (ramping-vus)
export const commonOptions = {
  stages,
  thresholds,
  summaryTrendStats,
  noConnectionReuse: false,
  userAgent: "k6-loadtest/1.0 (day3-inventory-ui)",
};
