import { createClient, type Client } from "@libsql/client";
import { runMigrations } from "./schema.js";

let client: Client | null = null;

export function getClient(): Client {
  if (!client) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return client;
}

export async function initDatabase(url?: string): Promise<Client> {
  client = createClient({
    url: url ?? `file:${process.cwd()}/data/inventory.db`,
  });
  await runMigrations(client);
  return client;
}

export function closeDatabase(): void {
  if (client) {
    client.close();
    client = null;
  }
}
