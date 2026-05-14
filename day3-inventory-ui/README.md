# day3-inventory-ui

day2-inventory (CLI / REST 在庫管理システム) のロジックを土台に、Next.js 16 + shadcn/ui v4 で UI を載せるプロジェクト。

## 技術スタック

| 区分          | バージョン / 内容                                                                |
| ------------- | -------------------------------------------------------------------------------- |
| Runtime       | Node.js 22 LTS                                                                   |
| Framework     | Next.js 16.2.4 (App Router, Turbopack)                                           |
| UI            | React 19.2 / Tailwind CSS v4 / shadcn/ui v4 (base-nova preset)                   |
| Lang          | TypeScript 5 (strict, `moduleResolution: bundler`, alias `@/* → ./src/*`)        |
| Lint / Format | ESLint 9 (flat config) + Prettier 3 (`prettier-plugin-tailwindcss`)              |
| DB            | libSQL (`@libsql/client`, file: 接続)                                            |
| Toast         | sonner v2 (shadcn の `toast` は v4 で sonner に置換)                             |
| Form          | shadcn `field` コンポーネント (v4 で `form` から再構成) + `react-hook-form` 想定 |

## 導入済み shadcn コンポーネント

`src/components/ui/` 配下:
button, card, table, input, select, dialog, tabs, badge, dropdown-menu, field, label, separator, sonner

追加するときは `npx shadcn@latest add <component> -y -o`。

## ディレクトリ構成

```
day3-inventory-ui/
├── migrations/                    # day2 から複製した SQL マイグレーション
│   ├── 001_init.sql
│   ├── 002_add_lead_time_to_products.sql
│   └── 003_add_stock_lots.sql
├── data/                          # ローカル DB ファイル置き場 (gitignore)
├── public/
├── .env.local.example             # DATABASE_URL / MIGRATIONS_DIR の見本
├── components.json                # shadcn 設定
├── eslint.config.mjs
├── .prettierrc.json / .prettierignore
└── src/
    ├── app/                       # Next.js App Router
    │   ├── layout.tsx
    │   ├── page.tsx
    │   └── globals.css
    ├── components/ui/             # shadcn コンポーネント
    ├── lib/utils.ts               # cn ヘルパー
    ├── db/                        # ★ day2 から統合 (Next.js 用にリライト)
    │   ├── client.ts              # lazy-init + globalThis シングルトン
    │   └── migrator.ts            # 起動時に自動実行
    ├── modules/                   # ★ day2 のビジネスロジックそのまま
    │   ├── accounting.ts
    │   ├── campaign.ts
    │   ├── forecast.ts
    │   ├── order.ts
    │   ├── product.ts
    │   ├── product-import.ts
    │   └── stock.ts
    ├── errors/
    │   └── insufficient-stock.ts
    └── utils/                     # modules の依存
        ├── id.ts
        └── logger.ts
```

## DB 統合の要点

- `db/client.ts` は `globalThis` 経由でクライアントをキャッシュし、Next.js dev の HMR でも接続が再生成されない作り
- `initDatabase()` は冪等。並行呼び出しでも同じ Promise を返すので二重マイグレーションは起きない
- 接続先は `process.env.DATABASE_URL` → 未設定なら `file:${process.cwd()}/data/inventory.db`
- マイグレーションディレクトリは `process.env.MIGRATIONS_DIR` → 未設定ならプロジェクト直下の `migrations/`
- `modules/` は day2 と同じく `getClient()` を同期で呼ぶ。各 API Route の入口で `await initDatabase()` を 1 回呼べば以降は使える
- libSQL 接続は Node ランタイム前提。API Route で `export const runtime = "edge"` は付けない

### API Route での使い方

```ts
// src/app/api/products/route.ts
import { initDatabase } from "@/db/client";
import { listProducts } from "@/modules/product";

export async function GET() {
  await initDatabase();
  const products = await listProducts();
  return Response.json(products);
}
```

## 環境変数

`.env.local.example` をコピーして `.env.local` を作る。

| 変数             | 既定値                     | 用途                                       |
| ---------------- | -------------------------- | ------------------------------------------ |
| `DATABASE_URL`   | `file:./data/inventory.db` | libSQL 接続文字列 (`file:` / `libsql:` 等) |
| `MIGRATIONS_DIR` | `./migrations`             | SQL マイグレーションのディレクトリ         |

day2 の既存 DB をそのまま使いたい場合:

```env
DATABASE_URL=file:/home/j-sakamoto/cc-practice/day2-inventory/data/inventory.db
```

## コマンド

| コマンド               | 用途                         |
| ---------------------- | ---------------------------- |
| `npm run dev`          | 開発サーバー起動 (Turbopack) |
| `npm run build`        | 本番ビルド                   |
| `npm run start`        | 本番サーバー起動 (build 後)  |
| `npm run lint`         | ESLint                       |
| `npm run format`       | Prettier 整形 (write)        |
| `npm run format:check` | Prettier 差分チェック        |

## 今後

- API Routes 雛形 (`/api/products`, `/api/stock`, `/api/orders` 等)
- 商品一覧 / 在庫一覧 / 注文一覧の UI ページ
- shadcn `field` + `react-hook-form` で入力フォーム
- sonner で操作通知
