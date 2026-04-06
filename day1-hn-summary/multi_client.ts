// Multi-source news aggregator.
// Ports the shell/lib/adapter_*.sh + common.sh logic to TypeScript.

import { fetchTopStories } from "./hn_client.ts";

export type SourceName = "hn" | "lobsters" | "devto" | "reddit";

export interface SourceStory {
  title: string;
  url: string;
  score: number;
  comments: number;
  source: SourceName;
}

export interface RankedSourceStory extends SourceStory {
  rank: number;
  normalizedScore: number;
}

// ---- Per-source adapters ----

async function fetchHn(fetchN: number): Promise<SourceStory[]> {
  const stories = await fetchTopStories(fetchN);
  return stories.map((s) => ({
    title: s.title,
    url: s.url,
    score: s.score,
    comments: s.descendants,
    source: "hn" as const,
  }));
}

async function fetchLobsters(fetchN: number): Promise<SourceStory[]> {
  console.error(`Fetching top ${fetchN} stories from Lobsters...`);
  const res = await fetch("https://lobste.rs/hottest.json");
  if (!res.ok) throw new Error(`Lobsters HTTP ${res.status}`);
  const raw = await res.json() as unknown[];
  return (raw as Record<string, unknown>[])
    .slice(0, fetchN)
    .map((item) => ({
      title: String(item["title"] ?? "No title"),
      url: String((item["url"] as string | undefined)?.trim() || (item["short_id_url"] ?? "")),
      score: Number(item["score"] ?? 0),
      comments: Number(item["comment_count"] ?? 0),
      source: "lobsters" as const,
    }));
}

async function fetchDevto(fetchN: number): Promise<SourceStory[]> {
  console.error(`Fetching top ${fetchN} stories from Dev.to...`);
  const res = await fetch(`https://dev.to/api/articles?top=7&per_page=${fetchN}`);
  if (!res.ok) throw new Error(`Dev.to HTTP ${res.status}`);
  const raw = await res.json() as Record<string, unknown>[];
  return raw.map((item) => ({
    title: String(item["title"] ?? "No title"),
    url: String(item["url"] ?? ""),
    score: Number(item["positive_reactions_count"] ?? 0),
    comments: Number(item["comments_count"] ?? 0),
    source: "devto" as const,
  }));
}

async function fetchReddit(fetchN: number): Promise<SourceStory[]> {
  console.error(`Fetching top ${fetchN} stories from Reddit r/programming...`);
  const res = await fetch(
    `https://www.reddit.com/r/programming/top.json?limit=${fetchN}`,
    { headers: { "User-Agent": "news-aggregator/1.0 (Deno)" } },
  );
  if (!res.ok) throw new Error(`Reddit HTTP ${res.status}`);
  const raw = await res.json() as { data: { children: { data: Record<string, unknown> }[] } };
  return raw.data.children.map(({ data: item }) => ({
    title: String(item["title"] ?? "No title"),
    url: String(item["url"] ?? ""),
    score: Number(item["score"] ?? 0),
    comments: Number(item["num_comments"] ?? 0),
    source: "reddit" as const,
  }));
}

// ---- Normalization & ranking ----

// Min-max normalize scores to 0-100 within a batch.
function normalizeScores(stories: SourceStory[]): (SourceStory & { normalizedScore: number })[] {
  if (stories.length === 0) return [];
  const scores = stories.map((s) => s.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return stories.map((s) => ({
    ...s,
    normalizedScore: max === min ? 50 : Math.round(((s.score - min) / (max - min)) * 100),
  }));
}

// ---- Public API ----

const ADAPTERS: Record<SourceName, (n: number) => Promise<SourceStory[]>> = {
  hn: fetchHn,
  lobsters: fetchLobsters,
  devto: fetchDevto,
  reddit: fetchReddit,
};

/**
 * Fetch from multiple sources, normalize scores per source, merge and return top N ranked stories.
 */
export async function fetchMultiSource(
  sources: SourceName[],
  fetchN: number,
  topN: number,
): Promise<RankedSourceStory[]> {
  const results = await Promise.allSettled(
    sources.map((src) => ADAPTERS[src](fetchN)),
  );

  const normalized: (SourceStory & { normalizedScore: number })[] = [];
  for (let i = 0; i < sources.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      normalized.push(...normalizeScores(result.value));
    } else {
      console.error(`Warning: ${sources[i]} の取得に失敗しました — スキップします:`, result.reason);
    }
  }

  return normalized
    .sort((a, b) => b.normalizedScore - a.normalizedScore)
    .slice(0, topN)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}
