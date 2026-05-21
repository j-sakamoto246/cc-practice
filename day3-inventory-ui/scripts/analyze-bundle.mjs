#!/usr/bin/env node
// Run source-map-explorer against the production client bundle.
// Outputs an HTML report and a JSON summary into .next/analyze/.

import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const root = process.cwd();
const chunkDir = path.join(root, ".next", "static", "chunks");
const outDir = path.join(root, ".next", "analyze");

if (!existsSync(chunkDir)) {
  console.error(`[analyze-bundle] ${chunkDir} not found. Run \`npm run build\` first.`);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

const htmlOut = path.join(outDir, "bundle.html");
const jsonOut = path.join(outDir, "bundle.json");
const glob = path.join(chunkDir, "**/*.js");

const baseArgs = [glob, "--only-mapped", "--no-border-checks"];

async function run(args, label) {
  console.log(`[analyze-bundle] ${label}`);
  const { stdout, stderr } = await execFileAsync("npx", ["source-map-explorer", ...args], {
    maxBuffer: 1024 * 1024 * 64,
  });
  if (stderr) process.stderr.write(stderr);
  return stdout;
}

await run(
  [...baseArgs, "--html", htmlOut],
  `Writing HTML report → ${path.relative(root, htmlOut)}`,
);
const jsonText = await run([...baseArgs, "--json"], "Generating JSON summary");

const { default: fs } = await import("node:fs/promises");
await fs.writeFile(jsonOut, jsonText);

const parsed = JSON.parse(jsonText);
const aggregate = new Map();
let totalBytes = 0;

for (const result of parsed.results ?? []) {
  for (const [file, info] of Object.entries(result.files ?? {})) {
    const size = typeof info === "number" ? info : info?.size;
    if (typeof size !== "number") continue;
    aggregate.set(file, (aggregate.get(file) ?? 0) + size);
    totalBytes += size;
  }
}

const sorted = [...aggregate.entries()].sort((a, b) => b[1] - a[1]);
const fmt = (n) => `${(n / 1024).toFixed(1)} kB`;

console.log("\n=== Top 25 modules (decoded source size) ===");
console.log(`Total mapped bytes: ${fmt(totalBytes)}\n`);
for (const [file, size] of sorted.slice(0, 25)) {
  const pct = ((size / totalBytes) * 100).toFixed(1).padStart(5);
  console.log(`${pct}%  ${fmt(size).padStart(10)}  ${file}`);
}

console.log(`\nReports written to ${path.relative(root, outDir)}/`);
