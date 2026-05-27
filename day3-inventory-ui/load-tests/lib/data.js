// scripts/seed-dummy.mjs が投入する ID とペイロード生成ヘルパー
// 値の変更が必要になったら seed-dummy.mjs と同期させる。

export const SEEDED_PRODUCT_IDS = [
  "prd-coffee-001",
  "prd-filter-002",
  "prd-cup-003",
  "prd-syrup-004",
  "prd-tea-005",
  "prd-milk-006",
];

export const SEEDED_WAREHOUSE_IDS = ["wh-tokyo", "wh-osaka", "wh-fukuoka"];

// seed-dummy.mjs の price と一致させる (受注の単価検証用)
export const SEEDED_PRODUCT_PRICES = {
  "prd-coffee-001": 1800,
  "prd-filter-002": 650,
  "prd-cup-003": 1200,
  "prd-syrup-004": 1450,
  "prd-tea-005": 2200,
  "prd-milk-006": 380,
};

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function buildStockInPayload() {
  return {
    type: "in",
    product_id: pickRandom(SEEDED_PRODUCT_IDS),
    warehouse_id: pickRandom(SEEDED_WAREHOUSE_IDS),
    quantity: randomInt(1, 10),
    memo: "k6 stock_in",
  };
}

// 在庫不足 (409) を避けるため quantity は 1 固定
export function buildStockOutPayload() {
  return {
    type: "out",
    product_id: pickRandom(SEEDED_PRODUCT_IDS),
    warehouse_id: pickRandom(SEEDED_WAREHOUSE_IDS),
    quantity: 1,
    memo: "k6 stock_out",
  };
}

export function buildOrderPayload(itemsCount = randomInt(1, 3)) {
  const used = new Set();
  const items = [];
  for (let i = 0; i < itemsCount; i++) {
    let pid;
    do {
      pid = pickRandom(SEEDED_PRODUCT_IDS);
    } while (used.has(pid) && used.size < SEEDED_PRODUCT_IDS.length);
    used.add(pid);
    items.push({
      product_id: pid,
      quantity: randomInt(1, 5),
      unit_price: SEEDED_PRODUCT_PRICES[pid],
    });
  }
  return {
    customer_name: `k6 顧客 ${randomInt(1, 9999)}`,
    items,
  };
}
