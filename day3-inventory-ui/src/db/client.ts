import { createClient, type Client } from "@libsql/client";
import { migrateUp } from "./migrator";

const globalForDb = globalThis as unknown as {
  __dbClient?: Client;
  __dbInitPromise?: Promise<Client>;
};

function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return `file:${process.cwd()}/data/inventory.db`;
}

export function getClient(): Client {
  if (!globalForDb.__dbClient) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return globalForDb.__dbClient;
}

export function initDatabase(url?: string): Promise<Client> {
  if (globalForDb.__dbInitPromise) return globalForDb.__dbInitPromise;
  globalForDb.__dbInitPromise = (async () => {
    const client = createClient({ url: url ?? resolveDatabaseUrl() });
    await client.execute("PRAGMA foreign_keys = ON");
    await client.execute("PRAGMA journal_mode = WAL");
    await migrateUp(client);
    globalForDb.__dbClient = client;
    return client;
  })();
  return globalForDb.__dbInitPromise;
}

export function closeDatabase(): void {
  if (globalForDb.__dbClient) {
    globalForDb.__dbClient.close();
    globalForDb.__dbClient = undefined;
    globalForDb.__dbInitPromise = undefined;
  }
}
