// Zod schemas for validating HN Firebase API responses.
// All item fields are optional — the HN API can omit any field.

import { z } from "./deps.ts";

// GET /v0/topstories.json — returns array of story IDs
export const TopStoriesSchema = z.array(z.number().int().positive());

// GET /v0/item/<id>.json — returns a story object
export const HnItemSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().optional(),
  url: z.string().optional(),
  score: z.number().int().nonnegative().optional(),
  descendants: z.number().int().nonnegative().optional(),
  type: z.string().optional(),
  deleted: z.boolean().optional(),
});

export type HnItem = z.infer<typeof HnItemSchema>;
export type TopStories = z.infer<typeof TopStoriesSchema>;
