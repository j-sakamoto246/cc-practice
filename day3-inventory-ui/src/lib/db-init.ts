import "server-only";

import { initDatabase } from "@/db/client";

let initPromise: Promise<unknown> | null = null;

export function ensureDb(): Promise<unknown> {
  if (!initPromise) {
    initPromise = initDatabase();
  }
  return initPromise;
}
