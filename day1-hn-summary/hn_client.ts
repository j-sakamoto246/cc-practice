// HN Firebase API client with retry logic and rate limiting.
// Sequential fetches with 1-second delay between stories — mirrors `sleep 1` in hn-top10.sh.

import { HnItemSchema, TopStoriesSchema } from "./schemas.ts";
import type { Story } from "./types.ts";

const BASE_URL = "https://hacker-news.firebaseio.com/v0";
const MAX_RETRY = 3;
const RETRY_DELAY_MS = 2000;
const RATE_LIMIT_MS = 1000;

// Fetch JSON from a URL, retrying up to MAX_RETRY times on failure.
async function fetchJsonWithRetry(url: string): Promise<unknown> {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Warning: ${url} の取得に失敗 (${attempt}/${MAX_RETRY})... ${msg}`);
      if (attempt < MAX_RETRY) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw new Error(`${url} を ${MAX_RETRY} 回試みましたが取得できませんでした。`);
}

// Fetch top story IDs, returning the first fetchN.
export async function fetchTopStoryIds(fetchN: number): Promise<number[]> {
  const raw = await fetchJsonWithRetry(`${BASE_URL}/topstories.json`);
  const result = TopStoriesSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`topstories.json のパースに失敗: ${result.error.message}`);
  }
  return result.data.slice(0, fetchN);
}

// Fetch a single story by ID. Returns null if the item fails validation or is deleted.
export async function fetchStory(id: number): Promise<Story | null> {
  const raw = await fetchJsonWithRetry(`${BASE_URL}/item/${id}.json`);
  const result = HnItemSchema.safeParse(raw);
  if (!result.success) {
    console.error(`Warning: item/${id}.json のパースに失敗 — スキップします`);
    return null;
  }
  const item = result.data;
  if (item.deleted) return null;
  return {
    title: item.title ?? "No title",
    url: item.url ?? `https://news.ycombinator.com/item?id=${id}`,
    score: item.score ?? 0,
    descendants: item.descendants ?? 0,
  };
}

// Fetch all stories sequentially with a 1-second delay between requests.
export async function fetchTopStories(fetchN: number): Promise<Story[]> {
  console.error(`Fetching top ${fetchN} stories from Hacker News...`);
  const ids = await fetchTopStoryIds(fetchN);
  const stories: Story[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }
    const story = await fetchStory(ids[i]);
    if (story !== null) stories.push(story);
  }
  return stories;
}
