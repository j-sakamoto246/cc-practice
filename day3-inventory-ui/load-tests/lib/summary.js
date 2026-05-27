// handleSummary: HTML + JSON + stdout テキストを出力
// SCENARIO_NAME=<name> で出力ファイル名を区別する。

import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

export function handleSummary(data) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = __ENV.SCENARIO_NAME || "load-test";
  return {
    [`load-tests/reports/${name}-${stamp}.html`]: htmlReport(data),
    [`load-tests/reports/${name}-${stamp}.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
