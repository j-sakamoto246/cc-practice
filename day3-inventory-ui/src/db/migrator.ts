import type { Client } from "@libsql/client";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

export interface Migration {
  version: string;
  name: string;
  filename: string;
  up: string;
  down: string;
}

export interface MigrationStatus {
  version: string;
  name: string;
  applied: boolean;
  appliedAt: string | null;
}

export interface MigrateOptions {
  dir?: string;
}

const FILENAME_RE = /^(\d+)_([A-Za-z0-9_-]+)\.sql$/;
const UP_MARKER_RE = /^--\s*\+migrate\s+Up\s*$/im;
const DOWN_MARKER_RE = /^--\s*\+migrate\s+Down\s*$/im;

const SCHEMA_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

const TEMPLATE = `-- +migrate Up


-- +migrate Down

`;

export function parseMigration(content: string): { up: string; down: string } {
  const upMatch = UP_MARKER_RE.exec(content);
  if (!upMatch) throw new Error("missing '-- +migrate Up' marker");
  const downMatch = DOWN_MARKER_RE.exec(content);
  if (!downMatch) throw new Error("missing '-- +migrate Down' marker");
  if (downMatch.index <= upMatch.index) {
    throw new Error("'-- +migrate Down' must appear after '-- +migrate Up'");
  }
  const upStart = upMatch.index + upMatch[0].length;
  const downStart = downMatch.index + downMatch[0].length;
  const up = content.slice(upStart, downMatch.index).trim();
  const down = content.slice(downStart).trim();
  if (!up) throw new Error("up section is empty");
  return { up, down };
}

function defaultDir(): string {
  return process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "migrations");
}

async function listFiles(
  dir: string,
): Promise<{ version: string; name: string; filename: string }[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: { version: string; name: string; filename: string }[] = [];
  for (const filename of entries) {
    const m = FILENAME_RE.exec(filename);
    if (!m) continue;
    out.push({ version: m[1]!, name: m[2]!, filename });
  }
  out.sort((a, b) => a.version.localeCompare(b.version));
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.version === out[i - 1]!.version) {
      throw new Error(`duplicate migration version: ${out[i]!.version}`);
    }
  }
  return out;
}

export async function loadMigrations(dir: string = defaultDir()): Promise<Migration[]> {
  const files = await listFiles(dir);
  const migrations: Migration[] = [];
  for (const f of files) {
    const content = await readFile(path.join(dir, f.filename), "utf8");
    try {
      const { up, down } = parseMigration(content);
      migrations.push({ ...f, up, down });
    } catch (err) {
      throw new Error(`${f.filename}: ${(err as Error).message}`);
    }
  }
  return migrations;
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.execute(SCHEMA_MIGRATIONS_TABLE);
}

export async function getApplied(client: Client): Promise<string[]> {
  await ensureMigrationsTable(client);
  const res = await client.execute("SELECT version FROM schema_migrations ORDER BY version");
  return res.rows.map((r) => r.version as string);
}

export function splitSql(sql: string): string[] {
  const stmts: string[] = [];
  let buf = "";
  let i = 0;
  let inStr: string | null = null;
  while (i < sql.length) {
    const ch = sql[i]!;
    const next = sql[i + 1];
    if (inStr) {
      buf += ch;
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inStr = ch;
      buf += ch;
      i++;
      continue;
    }
    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt) stmts.push(stmt);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail) stmts.push(tail);
  return stmts;
}

async function withTransaction(
  client: Client,
  body: () => Promise<void>,
  errorContext: string,
): Promise<void> {
  await client.execute("BEGIN");
  try {
    await body();
    await client.execute("COMMIT");
  } catch (err) {
    await client.execute("ROLLBACK").catch(() => undefined);
    throw new Error(`${errorContext}: ${(err as Error).message}`);
  }
}

async function executeStatements(client: Client, sql: string): Promise<void> {
  for (const stmt of splitSql(sql)) {
    await client.execute(stmt);
  }
}

async function applyUp(client: Client, m: Migration): Promise<void> {
  await withTransaction(
    client,
    async () => {
      await executeStatements(client, m.up);
      await client.execute({
        sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        args: [m.version, m.name, new Date().toISOString()],
      });
    },
    `migration ${m.filename} up failed`,
  );
}

async function applyDown(client: Client, m: Migration): Promise<void> {
  if (!m.down) {
    throw new Error(`migration ${m.filename} has no down section`);
  }
  await withTransaction(
    client,
    async () => {
      await executeStatements(client, m.down);
      await client.execute({
        sql: "DELETE FROM schema_migrations WHERE version = ?",
        args: [m.version],
      });
    },
    `migration ${m.filename} down failed`,
  );
}

export async function migrateUp(client: Client, opts: MigrateOptions = {}): Promise<Migration[]> {
  const migrations = await loadMigrations(opts.dir);
  const applied = new Set(await getApplied(client));
  const pending = migrations.filter((m) => !applied.has(m.version));
  for (const m of pending) {
    await applyUp(client, m);
  }
  return pending;
}

export async function migrateDown(
  client: Client,
  opts: MigrateOptions = {},
): Promise<Migration | null> {
  const migrations = await loadMigrations(opts.dir);
  const applied = await getApplied(client);
  if (applied.length === 0) return null;
  const lastVersion = applied[applied.length - 1]!;
  const target = migrations.find((m) => m.version === lastVersion);
  if (!target) {
    throw new Error(
      `applied migration ${lastVersion} has no matching file in ${opts.dir ?? defaultDir()}`,
    );
  }
  await applyDown(client, target);
  return target;
}

export async function migrateStatus(
  client: Client,
  opts: MigrateOptions = {},
): Promise<MigrationStatus[]> {
  const migrations = await loadMigrations(opts.dir);
  await ensureMigrationsTable(client);
  const res = await client.execute("SELECT version, applied_at FROM schema_migrations");
  const appliedAt = new Map<string, string>(
    res.rows.map((r) => [r.version as string, r.applied_at as string]),
  );
  return migrations.map((m) => ({
    version: m.version,
    name: m.name,
    applied: appliedAt.has(m.version),
    appliedAt: appliedAt.get(m.version) ?? null,
  }));
}

export async function createMigration(name: string, opts: MigrateOptions = {}): Promise<string> {
  const dir = opts.dir ?? defaultDir();
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) {
    throw new Error("migration name must contain alphanumeric characters");
  }
  await mkdir(dir, { recursive: true });
  const existing = await listFiles(dir);
  const nextNum =
    existing.length === 0 ? 1 : Math.max(...existing.map((m) => parseInt(m.version, 10))) + 1;
  const version = String(nextNum).padStart(3, "0");
  const filename = `${version}_${slug}.sql`;
  const filepath = path.join(dir, filename);
  await writeFile(filepath, TEMPLATE, { flag: "wx" });
  return filepath;
}
