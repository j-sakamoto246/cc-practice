# Cloudflare Workers + D1 移行メモ

このアプリを将来 Cloudflare Workers + D1 にデプロイする場合の修正方針です。

現状は Next.js App Router を Node.js 環境で動かし、`@libsql/client` で `file:data/inventory.db` を開いています。Workers + D1 ではローカルファイル DB ではなく、Worker binding 経由の D1 Database を使うため、主に DB 接続層とデプロイ設定の変更が必要です。

## 推奨方針

Next.js は Cloudflare Workers 上で `@opennextjs/cloudflare` adapter を使って動かす。

D1 は Worker binding として渡し、アプリ内では既存 module が大きく変わらないように `src/db/client.ts` に D1 互換アダプタを用意する。

## 追加する設定

必要になるパッケージ例:

```bash
npm install -D wrangler @opennextjs/cloudflare
```

`package.json` に追加する script 例:

```json
{
  "scripts": {
    "preview:cf": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "deploy:cf": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
  }
}
```

`wrangler.jsonc` 例:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "day3-inventory-ui",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-04-28",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "inventory-ui",
      "database_id": "replace-with-cloudflare-d1-database-id"
    }
  ]
}
```

`open-next.config.ts` 例:

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
```

## D1 データベース作成

```bash
npx wrangler d1 create inventory-ui
```

出力された `database_id` を `wrangler.jsonc` に設定する。

## DB 接続層の修正

現在:

- [src/db/client.ts](../src/db/client.ts) が `@libsql/client` の `createClient` を使う
- `getClient()` は `execute()` と `batch()` を持つ libSQL client を返す
- `initDatabase()` が migration を自動実行する

Workers + D1 では `env.DB` を直接参照する必要がある。Next.js + OpenNext では Cloudflare binding の取得方法を決める必要があるため、実装時点の `@opennextjs/cloudflare` 推奨 API に合わせる。

目標は、既存 module 側の変更を最小にするため、次のような薄いアダプタを作ること。

```ts
type DbArgs = Array<string | number | null>;

type DbExecuteInput = string | { sql: string; args?: DbArgs };

export interface AppDbClient {
  execute(input: DbExecuteInput): Promise<{ rows: Record<string, unknown>[] }>;
  batch(statements: { sql: string; args?: DbArgs }[]): Promise<unknown>;
}
```

D1 実装イメージ:

```ts
function createD1Client(db: D1Database): AppDbClient {
  return {
    async execute(input) {
      const sql = typeof input === "string" ? input : input.sql;
      const args = typeof input === "string" ? [] : (input.args ?? []);
      const result = await db.prepare(sql).bind(...args).all();
      return { rows: result.results as Record<string, unknown>[] };
    },
    async batch(statements) {
      return db.batch(
        statements.map((statement) =>
          db.prepare(statement.sql).bind(...(statement.args ?? [])),
        ),
      );
    },
  };
}
```

注意:

- D1 の bound parameters は 1 query あたり 100 個まで。
- `@libsql/client` と D1 は戻り値や transaction の扱いが完全には同じではない。
- `client.execute("BEGIN")` のような transaction 実装は D1 では再検討する。

## migration の修正

現在:

- [src/db/migrator.ts](../src/db/migrator.ts) が Node.js の `fs/promises` で `migrations/*.sql` を読み込む
- アプリ起動時に `initDatabase()` から自動 migration する

Workers 本番では runtime でファイルシステムを読んで migration する設計は避ける。

推奨:

1. migration SQL は `wrangler d1 migrations` または `wrangler d1 execute` でデプロイ前に適用する
2. 本番 Worker の request path では migration を実行しない
3. ローカル開発用だけ現在の自動 migration を残すか、D1 local に寄せる

コマンド例:

```bash
npx wrangler d1 migrations create inventory-ui init
npx wrangler d1 migrations apply inventory-ui --local
npx wrangler d1 migrations apply inventory-ui --remote
```

既存の `migrations/*.sql` は `-- +migrate Up/Down` 形式なので、D1 migration 用には Up SQL 部分を Cloudflare の migration ファイルへ移す必要がある。

## seed データの扱い

現在:

- [scripts/seed-dummy.mjs](../scripts/seed-dummy.mjs) が `@libsql/client` で `file:data/inventory.db` に投入する

D1 用には別 seed が必要。

選択肢:

1. seed SQL を作り、`wrangler d1 execute` で投入する
2. D1 binding を使う Worker/CLI 用 seed script を別途作る

小規模なら SQL ファイルが簡単。

```bash
npx wrangler d1 execute inventory-ui --local --file ./scripts/seed-dummy-d1.sql
npx wrangler d1 execute inventory-ui --remote --file ./scripts/seed-dummy-d1.sql
```

## 既存 module への影響

影響が大きい場所:

- [src/db/client.ts](../src/db/client.ts)
- [src/db/migrator.ts](../src/db/migrator.ts)
- DB を直接使う modules
  - [src/modules/product.ts](../src/modules/product.ts)
  - [src/modules/stock.ts](../src/modules/stock.ts)
  - [src/modules/order.ts](../src/modules/order.ts)
  - [src/modules/dashboard.ts](../src/modules/dashboard.ts)
  - その他 `getClient()` を使う module

module 側は `getClient().execute()` と `getClient().batch()` の利用に寄せられているため、D1 adapter が libSQL 互換の戻り値を返せれば大部分は維持できる。

ただし、以下は確認する。

- `row["field"] as number` が D1 でも想定通り number になるか
- `datetime('now')` の文字列形式が既存 UI の date parsing と合うか
- `batch()` の atomicity が必要な在庫操作で問題ないか
- `stockOut()` の FIFO 更新処理が同時実行時に破綻しないか

## 在庫操作の同時実行リスク

D1 は個別 DB が単一スレッドで処理されるため、極端な並列書き込みには強くない。一方で、このアプリの規模なら通常は問題になりにくい。

それでも出庫処理は在庫数を減らすため、次を検討する。

- 出庫前チェックは API 側で必ず実施する
- `UPDATE inventory SET quantity = quantity - ? WHERE ... AND quantity >= ?` のような条件付き update に寄せる
- 更新件数が 0 の場合は在庫不足として扱う
- ロット消費も同様に条件付き update を検討する

現状の `stockOut()` はロット選択後に複数 statement で更新するため、将来的に本番運用するならここは重点確認箇所。

## Next.js / OpenNext 注意点

Cloudflare Workers で Next.js を動かすには OpenNext adapter の制約に従う。

確認する項目:

- `nodejs_compat` を有効にする
- middleware に Node.js runtime 前提のコードを置かない
- `next/font/google` が Cloudflare build で問題なく処理されるか確認する
- Worker bundle size limit に収まるか確認する
- `server-only` import が OpenNext build で問題ないか確認する

## 移行作業チェックリスト

1. `wrangler` と `@opennextjs/cloudflare` を追加
2. `wrangler.jsonc` と `open-next.config.ts` を追加
3. D1 database を作成
4. D1 migration ファイルを作成し、schema を適用
5. `src/db/client.ts` に D1 adapter を追加
6. 本番では `initDatabase()` の自動 migration を止める
7. seed SQL または D1 用 seed script を追加
8. `npm run preview:cf` で Workers runtime をローカル確認
9. 商品、在庫、受注、発送の CRUD/API を一通り確認
10. `npm run deploy:cf` で Cloudflare にデプロイ

## 最終判断

Workers + D1 はこのアプリに適しているが、Vercel + Turso より移行作業は多い。

Cloudflare に寄せるなら、早めに DB 層だけでも `AppDbClient` のような抽象にしておくと、あとで D1 に差し替えやすい。
