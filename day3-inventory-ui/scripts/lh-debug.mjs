import lighthouse from "lighthouse";
import * as cl from "chrome-launcher";

const url = process.argv[2] ?? "http://127.0.0.1:3100/";
const chrome = await cl.launch({
  chromePath:
    "/home/j-sakamoto/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  userDataDir: "/tmp/lh-chrome-profile",
  chromeFlags: [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
  ],
});
try {
  const lhr = await lighthouse(url, {
    port: chrome.port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance"],
  });
  const a = lhr.lhr.audits;
  console.log("URL:", url);
  console.log(
    "score:",
    Math.round((lhr.lhr.categories.performance.score ?? 0) * 100),
  );
  const ids = [
    "server-response-time",
    "bootup-time",
    "mainthread-work-breakdown",
    "third-party-summary",
    "render-blocking-resources",
    "unused-javascript",
    "unminified-javascript",
    "duplicated-javascript",
    "long-tasks",
  ];
  for (const id of ids) {
    const x = a[id];
    if (!x) continue;
    console.log(`\n[${id}] score=${x.score} display=${x.displayValue ?? ""}`);
    if (x.details?.items) {
      for (const it of x.details.items.slice(0, 5)) {
        console.log("  ", JSON.stringify(it).slice(0, 250));
      }
    }
  }
} finally {
  await chrome.kill();
}
