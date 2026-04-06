// Output renderers for Markdown, HTML, and JSON formats.
// All functions are pure (no I/O).

import type { RankedStory } from "./types.ts";

// Markdown table — matches hn-top10.sh default output exactly.
export function formatMarkdown(stories: RankedStory[], date: string, topN: number): string {
  const lines: string[] = [
    "",
    `## Hacker News (${date}) — Score/Comment 比 トップ ${topN}`,
    "",
    "| # | Title | Score | Comments | Score/Comment |",
    "|---|---|---|---|---|",
  ];
  for (const s of stories) {
    lines.push(`| ${s.rank} | [${s.title}](${s.url}) | ${s.score} | ${s.descendants} | ${s.ratio} |`);
  }
  return lines.join("\n");
}

// HTML table — mirrors hn-top10.sh --format html output.
export function formatHtml(stories: RankedStory[], date: string): string {
  const rows = stories
    .map(
      (s) =>
        `<tr><td>${s.rank}</td><td><a href="${s.url}">${s.title}</a></td><td>${s.score}</td><td>${s.descendants}</td><td>${s.ratio}</td></tr>`,
    )
    .join("\n");
  return [
    `<h2>Hacker News (${date})</h2>`,
    "<table>",
    "<thead><tr><th>#</th><th>Title</th><th>Score</th><th>Comments</th><th>Score/Comment</th></tr></thead>",
    "<tbody>",
    rows,
    "</tbody>",
    "</table>",
  ].join("\n");
}

// JSON array — mirrors hn-top10.sh --format json output.
export function formatJson(stories: RankedStory[]): string {
  const data = stories.map((s) => ({
    rank: s.rank,
    title: s.title,
    url: s.url,
    score: s.score,
    comments: s.descendants,
    ratio: s.ratio,
  }));
  return JSON.stringify(data, null, 2);
}
