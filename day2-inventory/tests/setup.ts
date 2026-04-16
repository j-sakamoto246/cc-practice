import { beforeEach, afterEach } from "vitest";
import { initDatabase, closeDatabase } from "../src/db/client.js";

beforeEach(async () => {
  await initDatabase("file::memory:");
});

afterEach(() => {
  closeDatabase();
});
