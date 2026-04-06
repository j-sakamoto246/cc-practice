import { assertEquals } from "../deps.ts";
import { HnItemSchema, TopStoriesSchema } from "../schemas.ts";

// ── TopStoriesSchema ──────────────────────────────────────────────────────────

Deno.test("TopStoriesSchema: accepts array of positive integers", () => {
  const result = TopStoriesSchema.safeParse([1, 2, 3, 42000000]);
  assertEquals(result.success, true);
});

Deno.test("TopStoriesSchema: rejects array of strings", () => {
  const result = TopStoriesSchema.safeParse(["foo", "bar"]);
  assertEquals(result.success, false);
});

Deno.test("TopStoriesSchema: rejects non-array", () => {
  const result = TopStoriesSchema.safeParse({ id: 1 });
  assertEquals(result.success, false);
});

// ── HnItemSchema ──────────────────────────────────────────────────────────────

Deno.test("HnItemSchema: accepts minimal item (id only)", () => {
  const result = HnItemSchema.safeParse({ id: 12345 });
  assertEquals(result.success, true);
});

Deno.test("HnItemSchema: accepts full item with all fields", () => {
  const result = HnItemSchema.safeParse({
    id: 12345,
    title: "Test Story",
    url: "https://example.com",
    score: 100,
    descendants: 50,
    type: "story",
    deleted: false,
  });
  assertEquals(result.success, true);
});

Deno.test("HnItemSchema: accepts item without url (Ask HN style)", () => {
  const result = HnItemSchema.safeParse({
    id: 12345,
    title: "Ask HN: Something",
    score: 200,
    descendants: 80,
  });
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.url, undefined);
  }
});

Deno.test("HnItemSchema: rejects item without id", () => {
  const result = HnItemSchema.safeParse({ title: "No ID" });
  assertEquals(result.success, false);
});

Deno.test("HnItemSchema: rejects non-object", () => {
  const result = HnItemSchema.safeParse(null);
  assertEquals(result.success, false);
});

Deno.test("HnItemSchema: infers optional fields as undefined when absent", () => {
  const result = HnItemSchema.safeParse({ id: 1 });
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.title, undefined);
    assertEquals(result.data.score, undefined);
    assertEquals(result.data.descendants, undefined);
  }
});
