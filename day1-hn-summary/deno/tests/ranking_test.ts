import { assertEquals } from "../deps.ts";
import {
  calculateRatio,
  filterByMinComments,
  rankStories,
  selectTopN,
} from "../ranking.ts";
import type { Story } from "../types.ts";

// Stories derived from testdata/mock_hn_items.json
// Alpha: score=100, descendants=50  → ratio = round(100/50*10)/10 = 2.0
// Beta:  score=200, descendants=80  → ratio = round(200/80*10)/10 = 2.5
// Gamma: score=50,  descendants=0   → ratio = 50 (no comments edge case)
const ALPHA: Story = {
  title: "HN Article Alpha",
  url: "https://example.com/hn1",
  score: 100,
  descendants: 50,
};
const BETA: Story = {
  title: "HN Article Beta",
  url: "https://example.com/hn2",
  score: 200,
  descendants: 80,
};
const GAMMA: Story = {
  title: "HN Article Gamma",
  url: "https://news.ycombinator.com/item?id=3",
  score: 50,
  descendants: 0,
};

const ALL_STORIES = [ALPHA, BETA, GAMMA];

// ── calculateRatio ────────────────────────────────────────────────────────────

Deno.test("calculateRatio: normal case rounds to 1 decimal", () => {
  // 100 / 50 = 2.0
  assertEquals(calculateRatio(ALPHA), 2.0);
});

Deno.test("calculateRatio: normal case with non-integer result", () => {
  // 200 / 80 = 2.5
  assertEquals(calculateRatio(BETA), 2.5);
});

Deno.test("calculateRatio: descendants=0 returns score unchanged", () => {
  assertEquals(calculateRatio(GAMMA), 50);
});

Deno.test("calculateRatio: rounds to nearest tenth", () => {
  // score=10, descendants=3 → 10/3 = 3.333... → round(3.333*10)/10 = 3.3
  const story: Story = { title: "", url: "", score: 10, descendants: 3 };
  assertEquals(calculateRatio(story), 3.3);
});

// ── selectTopN ────────────────────────────────────────────────────────────────

Deno.test("selectTopN: returns top 2 by score descending", () => {
  const result = selectTopN(ALL_STORIES, 2);
  assertEquals(result.length, 2);
  assertEquals(result[0].score, 200); // BETA
  assertEquals(result[1].score, 100); // ALPHA
});

Deno.test("selectTopN: returns all if N >= length", () => {
  const result = selectTopN(ALL_STORIES, 10);
  assertEquals(result.length, 3);
});

Deno.test("selectTopN: does not mutate original array", () => {
  const original = [...ALL_STORIES];
  selectTopN(ALL_STORIES, 2);
  assertEquals(ALL_STORIES, original);
});

// ── filterByMinComments ───────────────────────────────────────────────────────

Deno.test("filterByMinComments: excludes stories below threshold", () => {
  const result = filterByMinComments(ALL_STORIES, 51);
  // Only BETA (descendants=80) passes; ALPHA=50, GAMMA=0 are excluded
  assertEquals(result.length, 1);
  assertEquals(result[0].title, "HN Article Beta");
});

Deno.test("filterByMinComments: minComments=0 returns all", () => {
  const result = filterByMinComments(ALL_STORIES, 0);
  assertEquals(result.length, 3);
});

Deno.test("filterByMinComments: exact boundary is inclusive", () => {
  // descendants=50, minComments=50 → should be included
  const result = filterByMinComments(ALL_STORIES, 50);
  const titles = result.map((s) => s.title);
  assertEquals(titles.includes("HN Article Alpha"), true);
  assertEquals(titles.includes("HN Article Beta"), true);
  assertEquals(titles.includes("HN Article Gamma"), false);
});

// ── rankStories ───────────────────────────────────────────────────────────────

Deno.test("rankStories: sorts by ratio descending", () => {
  // ratios: GAMMA=50, BETA=2.5, ALPHA=2.0 → GAMMA first
  const ranked = rankStories(ALL_STORIES);
  assertEquals(ranked[0].title, "HN Article Gamma"); // ratio=50
  assertEquals(ranked[1].title, "HN Article Beta"); // ratio=2.5
  assertEquals(ranked[2].title, "HN Article Alpha"); // ratio=2.0
});

Deno.test("rankStories: assigns 1-based ranks", () => {
  const ranked = rankStories(ALL_STORIES);
  assertEquals(ranked[0].rank, 1);
  assertEquals(ranked[1].rank, 2);
  assertEquals(ranked[2].rank, 3);
});

Deno.test("rankStories: attaches correct ratio to each story", () => {
  const ranked = rankStories(ALL_STORIES);
  const gamma = ranked.find((s) => s.title === "HN Article Gamma")!;
  assertEquals(gamma.ratio, 50);
  const beta = ranked.find((s) => s.title === "HN Article Beta")!;
  assertEquals(beta.ratio, 2.5);
});

Deno.test("rankStories: does not mutate original array", () => {
  const original = [...ALL_STORIES];
  rankStories(ALL_STORIES);
  assertEquals(ALL_STORIES, original);
});
