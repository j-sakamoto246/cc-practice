// Tests for hn_client.ts using stubbed fetch.
// These tests do not make real network calls.

import { assertEquals } from "../deps.ts";
import { stub } from "../deps.ts";
import { fetchStory, fetchTopStoryIds } from "../hn_client.ts";

// Helper to create a fake Response from a JSON value.
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── fetchTopStoryIds ──────────────────────────────────────────────────────────

Deno.test("fetchTopStoryIds: returns sliced IDs", async () => {
  const allIds = Array.from({ length: 500 }, (_, i) => i + 1);
  const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(jsonResponse(allIds)));
  try {
    const ids = await fetchTopStoryIds(5);
    assertEquals(ids, [1, 2, 3, 4, 5]);
    assertEquals(fetchStub.calls.length, 1);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("fetchTopStoryIds: throws on invalid response", async () => {
  const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(jsonResponse("not an array")));
  try {
    let threw = false;
    try {
      await fetchTopStoryIds(5);
    } catch {
      threw = true;
    }
    assertEquals(threw, true);
  } finally {
    fetchStub.restore();
  }
});

// ── fetchStory ────────────────────────────────────────────────────────────────

Deno.test("fetchStory: maps HN item to Story with all fields", async () => {
  const item = { id: 42, title: "Test", url: "https://example.com", score: 100, descendants: 50 };
  const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(jsonResponse(item)));
  try {
    const story = await fetchStory(42);
    assertEquals(story, {
      title: "Test",
      url: "https://example.com",
      score: 100,
      descendants: 50,
    });
  } finally {
    fetchStub.restore();
  }
});

Deno.test("fetchStory: applies URL fallback when url is absent", async () => {
  const item = { id: 99, title: "Ask HN: Question", score: 200, descendants: 80 };
  const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(jsonResponse(item)));
  try {
    const story = await fetchStory(99);
    assertEquals(story?.url, "https://news.ycombinator.com/item?id=99");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("fetchStory: applies default title when title is absent", async () => {
  const item = { id: 7, score: 10, descendants: 2 };
  const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(jsonResponse(item)));
  try {
    const story = await fetchStory(7);
    assertEquals(story?.title, "No title");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("fetchStory: returns null for deleted items", async () => {
  const item = { id: 5, deleted: true };
  const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(jsonResponse(item)));
  try {
    const story = await fetchStory(5);
    assertEquals(story, null);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("fetchStory: returns null when response fails Zod parse", async () => {
  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(jsonResponse({ notAnId: true })));
  try {
    const story = await fetchStory(1);
    assertEquals(story, null);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("fetchStory: retries on HTTP error then succeeds", async () => {
  const item = { id: 10, title: "Retry Story", score: 50, descendants: 10 };
  let callCount = 0;
  const fetchStub = stub(globalThis, "fetch", () => {
    callCount++;
    if (callCount === 1) return Promise.resolve(new Response(null, { status: 503 }));
    return Promise.resolve(jsonResponse(item));
  });
  try {
    const story = await fetchStory(10);
    assertEquals(story?.title, "Retry Story");
    assertEquals(callCount, 2);
  } finally {
    fetchStub.restore();
  }
});
