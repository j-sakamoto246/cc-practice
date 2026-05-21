#!/usr/bin/env node
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const baseUrl = process.env.LH_BASE_URL ?? "http://127.0.0.1:3100";
const target = Math.floor(Number(process.env.LH_TARGET ?? "90"));
const paths = process.env.LH_PATHS
  ? process.env.LH_PATHS.split(",")
      .map((p) => p.trim())
      .filter(Boolean)
  : [
      "/",
      "/products",
      "/stock",
      "/stock/inventory",
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

const runs = Math.max(1, Number(process.env.LH_RUNS ?? "3"));
const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const results = [];
let allPass = true;
try {
  for (const p of paths) {
    const url = `${baseUrl}${p}`;
    const trials = [];
    for (let i = 0; i < runs; i++) {
      const lhr = await lighthouse(
        url,
        {
          port: chrome.port,
          output: "json",
          logLevel: "error",
          onlyCategories: ["performance"],
        },
        undefined,
      );
      const audits = lhr.lhr.audits;
      trials.push({
        score: Math.round((lhr.lhr.categories.performance.score ?? 0) * 100),
        audits,
      });
    }
    const scores = trials.map((t) => t.score);
    const score = median(scores);
    const audits = trials.find((t) => t.score === score).audits;
    const metric = (id) => {
      const a = audits[id];
      return a ? { value: a.numericValue, display: a.displayValue } : null;
    };
    const opportunities = Object.values(audits)
      .filter(
        (a) =>
          a.score !== null &&
          a.score < 0.9 &&
          a.details?.type === "opportunity" &&
          (a.details.overallSavingsMs ?? 0) > 50,
      )
      .map((a) => ({
        id: a.id,
        title: a.title,
        savingsMs: a.details.overallSavingsMs ?? 0,
      }))
      .sort((a, b) => b.savingsMs - a.savingsMs)
      .slice(0, 6);
    results.push({
      path: p,
      score,
      scores,
      metrics: {
        FCP: metric("first-contentful-paint"),
        LCP: metric("largest-contentful-paint"),
        TBT: metric("total-blocking-time"),
        CLS: metric("cumulative-layout-shift"),
        SI: metric("speed-index"),
      },
      opportunities,
    });
    if (score < target) allPass = false;
  }
} finally {
  await chrome.kill();
}

console.log(
  "\n=== Lighthouse Performance Scores (target: " + target + ", median of " + runs + " runs) ===",
);
for (const r of results) {
  const status = r.score >= target ? "OK" : "FAIL";
  const trials = runs > 1 ? ` [${r.scores.join(",")}]` : "";
  console.log(`\n[${status}] ${r.path.padEnd(20)} score=${r.score}${trials}`);
  const m = r.metrics;
  const fmt = (x) => (x ? x.display : "?");
  console.log(
    `        FCP=${fmt(m.FCP)}  LCP=${fmt(m.LCP)}  TBT=${fmt(m.TBT)}  CLS=${fmt(m.CLS)}  SI=${fmt(m.SI)}`,
  );
  for (const o of r.opportunities) {
    console.log(`        ~${Math.round(o.savingsMs)}ms  ${o.id}: ${o.title}`);
  }
}

process.exit(allPass ? 0 : 1);
