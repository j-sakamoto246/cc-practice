// Pure transformation functions — no I/O, fully unit-testable.

import type { RankedStory, Story } from "./types.ts";

// Filter stories where comment count >= minComments.
export function filterByMinComments(stories: Story[], minComments: number): Story[] {
  return stories.filter((s) => s.descendants >= minComments);
}

// Sort by score descending and return the top N stories.
export function selectTopN(stories: Story[], topN: number): Story[] {
  return [...stories].sort((a, b) => b.score - a.score).slice(0, topN);
}

// Compute score/comment ratio.
// Mirrors jq formula in hn-top10.sh:
//   if .descendants > 0 then (.score / .descendants * 10 | round / 10) else .score end
export function calculateRatio(story: Story): number {
  if (story.descendants > 0) {
    return Math.round((story.score / story.descendants) * 10) / 10;
  }
  return story.score;
}

// Sort stories by ratio descending and assign 1-based ranks.
export function rankStories(stories: Story[]): RankedStory[] {
  return [...stories]
    .map((s) => ({ ...s, ratio: calculateRatio(s) }))
    .sort((a, b) => b.ratio - a.ratio)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}
