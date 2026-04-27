import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as fc from "fast-check";
import {
  parseMigration,
  loadMigrations,
  migrateUp,
  migrateDown,
  migrateStatus,
  getApplied,
  createMigration,
} from "../../src/db/migrator.js";

async function makeClient(): Promise<Client> {
  const c = createClient({ url: "file::memory:" });
  await c.execute("PRAGMA foreign_keys = ON");
  return c;
}

async function tableNames(client: Client): Promise<string[]> {
  const r = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations' ORDER BY name",
  );
  return r.rows.map((row) => row["name"] as string);
}

async function schemaSnapshot(client: Client): Promise<string> {
  const r = await client.execute(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != 'schema_migrations' ORDER BY type, name",
  );
  return JSON.stringify(r.rows);
}

const FIXTURES = {
  "001_alpha.sql": `-- +migrate Up
CREATE TABLE alpha (id TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE INDEX idx_alpha_value ON alpha(value);

-- +migrate Down
DROP TABLE alpha;
`,
  "002_beta.sql": `-- +migrate Up
CREATE TABLE beta (id TEXT PRIMARY KEY, alpha_id TEXT REFERENCES alpha(id));

-- +migrate Down
DROP TABLE beta;
`,
  "003_gamma.sql": `-- +migrate Up
ALTER TABLE alpha ADD COLUMN note TEXT DEFAULT '';

-- +migrate Down
ALTER TABLE alpha DROP COLUMN note;
`,
};

async function writeFixtures(dir: string, files: Record<string, string> = FIXTURES) {
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(dir, name), content);
  }
}

describe("parseMigration", () => {
  it("splits up and down sections", () => {
    const { up, down } = parseMigration(
      "-- +migrate Up\nCREATE TABLE x (id TEXT);\n-- +migrate Down\nDROP TABLE x;\n",
    );
    expect(up).toBe("CREATE TABLE x (id TEXT);");
    expect(down).toBe("DROP TABLE x;");
  });

  it("rejects missing Up marker", () => {
    expect(() => parseMigration("-- +migrate Down\nDROP TABLE x;")).toThrow(/Up/);
  });

  it("rejects missing Down marker", () => {
    expect(() => parseMigration("-- +migrate Up\nCREATE TABLE x (id TEXT);")).toThrow(/Down/);
  });

  it("rejects empty up section", () => {
    expect(() => parseMigration("-- +migrate Up\n\n-- +migrate Down\nDROP TABLE x;")).toThrow(
      /up section is empty/,
    );
  });

  it("rejects Down before Up", () => {
    expect(() =>
      parseMigration("-- +migrate Down\nfoo\n-- +migrate Up\nbar"),
    ).toThrow(/Down.*after.*Up/);
  });
});

describe("loadMigrations", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "mig-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns empty for nonexistent directory", async () => {
    const result = await loadMigrations(path.join(dir, "missing"));
    expect(result).toEqual([]);
  });

  it("loads and sorts files by version", async () => {
    await writeFixtures(dir);
    const m = await loadMigrations(dir);
    expect(m.map((x) => x.filename)).toEqual([
      "001_alpha.sql",
      "002_beta.sql",
      "003_gamma.sql",
    ]);
  });

  it("ignores non-migration files", async () => {
    await writeFixtures(dir, { "001_alpha.sql": FIXTURES["001_alpha.sql"]! });
    await writeFile(path.join(dir, "README.md"), "ignore me");
    await writeFile(path.join(dir, "no_prefix.sql"), "-- +migrate Up\nx\n-- +migrate Down\ny");
    const m = await loadMigrations(dir);
    expect(m).toHaveLength(1);
  });

  it("rejects duplicate versions", async () => {
    await writeFile(path.join(dir, "001_a.sql"), FIXTURES["001_alpha.sql"]!);
    await writeFile(path.join(dir, "001_b.sql"), FIXTURES["001_alpha.sql"]!);
    await expect(loadMigrations(dir)).rejects.toThrow(/duplicate/);
  });

  it("includes filename in parse errors", async () => {
    await writeFile(path.join(dir, "001_bad.sql"), "no markers here");
    await expect(loadMigrations(dir)).rejects.toThrow(/001_bad\.sql/);
  });
});

describe("migrate up/down/status", () => {
  let dir: string;
  let client: Client;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "mig-"));
    await writeFixtures(dir);
    client = await makeClient();
  });

  afterEach(async () => {
    client.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("up applies all pending migrations in order", async () => {
    const applied = await migrateUp(client, { dir });
    expect(applied.map((m) => m.version)).toEqual(["001", "002", "003"]);
    expect(await getApplied(client)).toEqual(["001", "002", "003"]);
    expect(await tableNames(client)).toEqual(["alpha", "beta"]);
  });

  it("up is idempotent", async () => {
    await migrateUp(client, { dir });
    const second = await migrateUp(client, { dir });
    expect(second).toEqual([]);
    expect(await getApplied(client)).toEqual(["001", "002", "003"]);
  });

  it("down reverts only the last migration", async () => {
    await migrateUp(client, { dir });
    const reverted = await migrateDown(client, { dir });
    expect(reverted?.version).toBe("003");
    expect(await getApplied(client)).toEqual(["001", "002"]);
    expect(await tableNames(client)).toEqual(["alpha", "beta"]);
  });

  it("down on empty DB is a no-op", async () => {
    const reverted = await migrateDown(client, { dir });
    expect(reverted).toBeNull();
  });

  it("status reports applied vs pending", async () => {
    let rows = await migrateStatus(client, { dir });
    expect(rows.every((r) => !r.applied)).toBe(true);

    await migrateUp(client, { dir });
    rows = await migrateStatus(client, { dir });
    expect(rows.every((r) => r.applied)).toBe(true);
    expect(rows.every((r) => r.appliedAt !== null)).toBe(true);

    await migrateDown(client, { dir });
    rows = await migrateStatus(client, { dir });
    expect(rows.map((r) => ({ v: r.version, a: r.applied }))).toEqual([
      { v: "001", a: true },
      { v: "002", a: true },
      { v: "003", a: false },
    ]);
  });
});

describe("rollback safety", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "mig-"));
    await writeFixtures(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("up → down → up restores the same schema", async () => {
    const a = await makeClient();
    await migrateUp(a, { dir });
    const after1 = await schemaSnapshot(a);

    await migrateDown(a, { dir });
    await migrateDown(a, { dir });
    await migrateDown(a, { dir });
    expect(await tableNames(a)).toEqual([]);
    expect(await getApplied(a)).toEqual([]);

    await migrateUp(a, { dir });
    const after2 = await schemaSnapshot(a);
    expect(after2).toBe(after1);
    a.close();
  });

  it("partial down then up converges to the same state", async () => {
    const a = await makeClient();
    await migrateUp(a, { dir });
    const target = await schemaSnapshot(a);

    await migrateDown(a, { dir });
    await migrateDown(a, { dir });
    await migrateUp(a, { dir });

    expect(await schemaSnapshot(a)).toBe(target);
    expect(await getApplied(a)).toEqual(["001", "002", "003"]);
    a.close();
  });

  it("property: any walk of up/down keeps schema_migrations consistent with schema", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom<"up" | "down">("up", "down"), {
          minLength: 1,
          maxLength: 12,
        }),
        async (steps) => {
          const c = await makeClient();
          try {
            for (const step of steps) {
              if (step === "up") await migrateUp(c, { dir });
              else await migrateDown(c, { dir });
            }
            const applied = await getApplied(c);
            const tables = await tableNames(c);
            // alpha & beta tables exist iff their versions are applied
            expect(tables.includes("alpha")).toBe(applied.includes("001"));
            expect(tables.includes("beta")).toBe(applied.includes("002"));
            // versions are always a contiguous prefix [001, 002, ...]
            const expected = ["001", "002", "003"].slice(0, applied.length);
            expect(applied).toEqual(expected);
          } finally {
            c.close();
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe("createMigration", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "mig-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates 001 in an empty directory", async () => {
    const filepath = await createMigration("add-users", { dir });
    expect(path.basename(filepath)).toBe("001_add_users.sql");
    const list = await loadMigrations(dir).catch(() => []);
    expect(list).toEqual([]); // template has empty up — loadMigrations rejects, so swallow
  });

  it("auto-increments version", async () => {
    await createMigration("first", { dir });
    await writeFile(
      path.join(dir, "001_first.sql"),
      "-- +migrate Up\nCREATE TABLE x (id TEXT);\n-- +migrate Down\nDROP TABLE x;\n",
    );
    const filepath = await createMigration("second", { dir });
    expect(path.basename(filepath)).toBe("002_second.sql");
  });

  it("rejects empty/symbol-only names", async () => {
    await expect(createMigration("***", { dir })).rejects.toThrow(/alphanumeric/);
  });

  it("auto-increments even when the same name is given twice", async () => {
    const a = await createMigration("dup", { dir });
    const b = await createMigration("dup", { dir });
    expect(path.basename(a)).toBe("001_dup.sql");
    expect(path.basename(b)).toBe("002_dup.sql");
  });
});
