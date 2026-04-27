import { Command } from "commander";
import { createClient, type Client } from "@libsql/client";
import {
  migrateUp,
  migrateDown,
  migrateStatus,
  createMigration,
} from "../db/migrator.js";

function dbUrl(): string {
  return `file:${process.cwd()}/data/inventory.db`;
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = createClient({ url: dbUrl() });
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute("PRAGMA journal_mode = WAL");
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}

export function registerMigrateCommands(parent: Command) {
  const cmd = parent.command("migrate").description("DB マイグレーション管理");

  cmd
    .command("up")
    .description("未適用のマイグレーションを全て適用")
    .action(async () => {
      await withClient(async (client) => {
        const applied = await migrateUp(client);
        if (applied.length === 0) {
          console.log("適用済み: 変更なし");
          return;
        }
        for (const m of applied) {
          console.log(`up    ${m.filename}`);
        }
      });
    });

  cmd
    .command("down")
    .description("最後に適用したマイグレーションをロールバック")
    .action(async () => {
      await withClient(async (client) => {
        const reverted = await migrateDown(client);
        if (!reverted) {
          console.log("適用済みマイグレーションはありません");
          return;
        }
        console.log(`down  ${reverted.filename}`);
      });
    });

  cmd
    .command("status")
    .description("マイグレーション適用状況を表示")
    .action(async () => {
      await withClient(async (client) => {
        const rows = await migrateStatus(client);
        if (rows.length === 0) {
          console.log("マイグレーションファイルがありません");
          return;
        }
        for (const r of rows) {
          const mark = r.applied ? "[applied]" : "[pending]";
          const at = r.appliedAt ?? "-";
          console.log(`${mark} ${r.version}_${r.name}  ${at}`);
        }
      });
    });

  cmd
    .command("create <name>")
    .description("新規マイグレーションファイルを生成")
    .action(async (name: string) => {
      const filepath = await createMigration(name);
      console.log(`作成しました: ${filepath}`);
    });
}
