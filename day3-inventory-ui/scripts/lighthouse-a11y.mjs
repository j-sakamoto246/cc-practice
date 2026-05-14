#!/usr/bin/env node
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const baseUrl = process.env.LH_BASE_URL ?? "http://127.0.0.1:3100";
const paths = [
  "/",
  "/products",
  "/stock",
  "/stock/inventory",
  "/stock/lots",
  "/stock/transfer",
  "/orders",
  "/forecast",
  "/campaigns",
  "/reports",
];

const chromePath =
  process.env.CHROME_PATH ??
  "/home/j-sakamoto/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";

const chrome = await chromeLauncher.launch({
  chromePath,
  userDataDir: "/tmp/lh-chrome-profile",
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

const results = [];
let allPass = true;
try {
  for (const p of paths) {
    const url = `${baseUrl}${p}`;
    const lhr = await lighthouse(
      url,
      {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["accessibility"],
      },
      undefined,
    );
    const score = Math.round((lhr.lhr.categories.accessibility.score ?? 0) * 100);
    const audits = lhr.lhr.audits;
    const failed = Object.values(audits)
      .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== "informative")
      .map((a) => ({ id: a.id, title: a.title, score: a.score }));
    results.push({ path: p, score, failed });
    if (score < 90) allPass = false;
  }
} finally {
  await chrome.kill();
}

console.log("\n=== Lighthouse Accessibility Scores ===");
for (const r of results) {
  const status = r.score >= 90 ? "OK" : "FAIL";
  console.log(`[${status}] ${r.path.padEnd(20)} score=${r.score}`);
  for (const f of r.failed) {
    console.log(`        - ${f.id}: ${f.title}`);
  }
}

process.exit(allPass ? 0 : 1);
