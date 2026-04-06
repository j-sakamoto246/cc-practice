import { assertEquals, assertMatch } from "../deps.ts";
import { formatHtml, formatJson, formatMarkdown } from "../formatters.ts";
import type { RankedStory } from "../types.ts";

const STORIES: RankedStory[] = [
  {
    rank: 1,
    title: "HN Article Gamma",
    url: "https://news.ycombinator.com/item?id=3",
    score: 50,
    descendants: 0,
    ratio: 50,
  },
  {
    rank: 2,
    title: "HN Article Beta",
    url: "https://example.com/hn2",
    score: 200,
    descendants: 80,
    ratio: 2.5,
  },
];

const DATE = "2026-04-06";

// ── formatMarkdown ────────────────────────────────────────────────────────────

Deno.test("formatMarkdown: heading includes date and topN", () => {
  const output = formatMarkdown(STORIES, DATE, 5);
  assertMatch(output, /## Hacker News \(2026-04-06\) — Score\/Comment 比 トップ 5/);
});

Deno.test("formatMarkdown: table header row is correct", () => {
  const output = formatMarkdown(STORIES, DATE, 5);
  assertEquals(output.includes("| # | Title | Score | Comments | Score/Comment |"), true);
});

Deno.test("formatMarkdown: separator row is correct", () => {
  const output = formatMarkdown(STORIES, DATE, 5);
  assertEquals(output.includes("|---|---|---|---|---|"), true);
});

Deno.test("formatMarkdown: data rows use Markdown link syntax", () => {
  const output = formatMarkdown(STORIES, DATE, 5);
  assertEquals(
    output.includes("| 1 | [HN Article Gamma](https://news.ycombinator.com/item?id=3) | 50 | 0 | 50 |"),
    true,
  );
  assertEquals(
    output.includes("| 2 | [HN Article Beta](https://example.com/hn2) | 200 | 80 | 2.5 |"),
    true,
  );
});

// ── formatHtml ────────────────────────────────────────────────────────────────

Deno.test("formatHtml: includes h2 with date", () => {
  const output = formatHtml(STORIES, DATE);
  assertMatch(output, /<h2>Hacker News \(2026-04-06\)<\/h2>/);
});

Deno.test("formatHtml: includes thead and tbody", () => {
  const output = formatHtml(STORIES, DATE);
  assertEquals(output.includes("<thead>"), true);
  assertEquals(output.includes("<tbody>"), true);
});

Deno.test("formatHtml: data rows contain anchor tags", () => {
  const output = formatHtml(STORIES, DATE);
  assertMatch(output, /<a href="https:\/\/example\.com\/hn2">HN Article Beta<\/a>/);
});

// ── formatJson ────────────────────────────────────────────────────────────────

Deno.test("formatJson: output is valid JSON", () => {
  const output = formatJson(STORIES);
  const parsed = JSON.parse(output);
  assertEquals(Array.isArray(parsed), true);
  assertEquals(parsed.length, 2);
});

Deno.test("formatJson: each item has expected keys", () => {
  const output = formatJson(STORIES);
  const [first] = JSON.parse(output);
  const keys = Object.keys(first).sort();
  assertEquals(keys, ["comments", "rank", "ratio", "score", "title", "url"]);
});

Deno.test("formatJson: comments field maps from descendants", () => {
  const output = formatJson(STORIES);
  const parsed = JSON.parse(output);
  const beta = parsed.find((s: { title: string }) => s.title === "HN Article Beta");
  assertEquals(beta.comments, 80);
});
