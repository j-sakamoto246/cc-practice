# day3-inventory-ui

day2-inventory (CLI / REST 在庫管理システム) のロジックを土台に、Next.js 16 + shadcn/ui v4 で UI を載せたプロジェクト。**PWA 対応**でオフライン時もキャッシュされたページが閲覧でき、書き込み操作はバックグラウンド同期されます。

## 技術スタック

| 区分          | バージョン / 内容                                                                    |
| ------------- | ------------------------------------------------------------------------------------ |
| Runtime       | Node.js 22 LTS                                                                       |
| Framework     | Next.js 16.2.4 (App Router, **webpack** — Serwist との互換性のため Turbopack 不使用) |
| UI            | React 19.2 / Tailwind CSS v4 / shadcn/ui v4 (base-nova preset) / lucide-react        |
| Lang          | TypeScript 5 (strict, `moduleResolution: bundler`, alias `@/* → ./src/*`)            |
| Lint / Format | ESLint 9 (flat config) + Prettier 3 (`prettier-plugin-tailwindcss`)                  |
| DB            | libSQL (`@libsql/client`, `file:` 接続)                                              |
| Toast         | sonner v2                                                                            |
| Form          | shadcn `field` コンポーネント (v4 で `form` から再構成)                              |
| Testing       | Vitest 4 + Testing Library / Playwright 1.59 (E2E + a11y)                            |
| A11y          | axe-core (Playwright + ランタイム) / Lighthouse                                      |
| Story         | Storybook 10 (Vite ビルダー) / Chromatic                                             |
| **PWA**       | **Serwist 9 (`@serwist/next`) + Workbox 系プラグイン**                               |

## 導入済み shadcn コンポーネント

`src/components/ui/` 配下:
`badge`, `button`, `card`, `dialog`, `dropdown-menu`, `field`, `input`, `label`, `select`, `separator`, `sonner`, `table`, `tabs`

追加するときは `npx shadcn@latest add <component> -y -o`。

> **shadcn v4 の `form` は廃止**: フォームは `field` コンポーネントで実装する。

## ディレクトリ構成

```
day3-inventory-ui/
├── migrations/                      # day2 から複製した SQL マイグレーション (001..003)
├── data/                            # ローカル DB ファイル置き場 (gitignore)
├── public/
│   ├── icons/                       # PWA アイコン (自動生成 PNG + SVG)
│   ├── sw.js                        # ビルド時に Serwist が生成 (gitignore 推奨)
│   └── swe-worker-*.js              # 同上
├── scripts/
│   ├── generate-pwa-icons.mjs       # PWA アイコンを node:zlib だけで生成 (依存ゼロ)
│   ├── seed-dummy.mjs               # ダミーデータ投入
│   ├── lighthouse-a11y.mjs          # a11y 監査
│   ├── lighthouse-perf.mjs          # パフォーマンス監査
│   └── analyze-bundle.mjs           # source-map-explorer によるバンドル解析
├── tests/e2e/                       # Playwright E2E + a11y (axe)
├── docs/
│   ├── cli-ui-gap.md                # day2 CLI と UI の機能差分
│   └── cloudflare-workers-d1-migration.md
└── src/
    ├── app/                         # Next.js App Router
    │   ├── layout.tsx               # SW 登録 / オフラインバナー / Install Prompt を組み込み
    │   ├── page.tsx                 # ダッシュボード
    │   ├── manifest.ts              # Web App Manifest (PWA)
    │   ├── sw.ts                    # Service Worker (Serwist)
    │   ├── offline/                 # オフラインフォールバック (/offline)
    │   ├── products/                # 商品一覧 / 編集 / インポート
    │   ├── stock/                   # 在庫一覧 / inventory / lots / transfer
    │   ├── orders/                  # 受注管理
    │   ├── campaigns/               # キャンペーン
    │   ├── forecast/                # 需要予測
    │   ├── reports/                 # 売上 / 在庫評価レポート
    │   └── api/                     # 各機能の REST 風 API
    ├── components/
    │   ├── ui/                      # shadcn コンポーネント
    │   ├── app-nav.tsx
    │   ├── axe-init.tsx             # 開発時に axe を起動
    │   ├── install-prompt.tsx       # A2HS プロンプト (Android / iOS 両対応)
    │   ├── online-status-banner.tsx # オフライン/同期状態のステータスバナー
    │   ├── service-worker-registrar.tsx
    │   └── toaster-mount.tsx
    ├── lib/                         # cn / toast / profiler 等
    ├── db/                          # libSQL クライアント + 自動マイグレーション
    ├── modules/                     # day2 由来のビジネスロジック
    ├── errors/
    └── utils/
```

## DB 統合の要点

- `db/client.ts` は `globalThis` 経由でクライアントをキャッシュし、HMR でも接続が再生成されない
- `initDatabase()` は冪等。並行呼び出しでも同じ Promise を返す
- 接続先は `process.env.DATABASE_URL` → 未設定なら `file:${process.cwd()}/data/inventory.db`
- マイグレーションディレクトリは `process.env.MIGRATIONS_DIR` → 未設定なら `./migrations`
- libSQL 接続は Node ランタイム前提。API Route で `runtime: "edge"` は付けない

### API Route での使い方

```ts
import { initDatabase } from "@/db/client";
import { listProducts } from "@/modules/product";

export async function GET() {
  await initDatabase();
  return Response.json(await listProducts());
}
```

## 環境変数

`.env.local.example` をコピーして `.env.local` を作る。

| 変数             | 既定値                     | 用途                                       |
| ---------------- | -------------------------- | ------------------------------------------ |
| `DATABASE_URL`   | `file:./data/inventory.db` | libSQL 接続文字列 (`file:` / `libsql:` 等) |
| `MIGRATIONS_DIR` | `./migrations`             | SQL マイグレーションのディレクトリ         |

## コマンド

| コマンド                       | 用途                                                     |
| ------------------------------ | -------------------------------------------------------- |
| `npm run dev`                  | 開発サーバー起動 (webpack)。dev では SW は無効化される   |
| `npm run build`                | 本番ビルド (webpack + Serwist が `public/sw.js` を生成)  |
| `npm run start`                | 本番サーバー起動 (build 後)                              |
| `npm run lint`                 | ESLint                                                   |
| `npm run format` / `:check`    | Prettier 整形 / 差分チェック                             |
| `npm run test` / `:watch`      | Vitest (ユニット / コンポーネント)                       |
| `npm run test:e2e` / `:ui`     | Playwright E2E                                           |
| `npm run test:a11y`            | Playwright + axe による a11y チェック                    |
| `npm run test:lighthouse`      | Lighthouse a11y 監査                                     |
| `npm run test:lighthouse:perf` | Lighthouse パフォーマンス監査                            |
| `npm run analyze:bundle`       | source-map-explorer でバンドルを可視化                   |
| `npm run icons:pwa`            | PWA アイコン (192/384/512/maskable/apple-touch) を再生成 |
| `npm run storybook`            | Storybook (port 6006)                                    |
| `npm run build-storybook`      | Storybook 静的ビルド                                     |
| `npm run test:storybook`       | Storybook test-runner                                    |
| `npm run chromatic`            | Chromatic にアップロード                                 |

> **Turbopack 不使用**: Next.js 16 デフォルトの Turbopack は `@serwist/next` の webpack インジェクションと衝突するため、`dev`/`build` は `--webpack` 固定。

## PWA とオフライン対応

### 構成

- **Manifest**: `src/app/manifest.ts` が `/manifest.webmanifest` を生成 (standalone, shortcuts, maskable icon)
- **Service Worker**: `src/app/sw.ts` を Serwist がバンドルして `public/sw.js` に出力
- **キャッシュ戦略**: `@serwist/next/worker` の `defaultCache` を踏襲 (RSC / pages / static / images / GET API は `NetworkFirst` / `StaleWhileRevalidate`)
- **オフラインフォールバック**: ナビゲーション失敗時は `/offline` を表示
- **インストールプロンプト**: 右下に表示。Android は `beforeinstallprompt`、iOS は共有ボタン案内。「後で」は 7 日間サプレス
- **ステータスバナー**: 画面上部にオフライン / 同期中 / 同期完了を表示

### バックグラウンド同期

書き込み系 API (`/api/*` の `POST/PUT/PATCH/DELETE`) は `BackgroundSyncPlugin` で IndexedDB キュー `inventory-mutations` に保管され、オンライン復帰時 (`sync` イベント) に順次リプレイされる。SW → クライアントへ `postMessage` で `sync-queued / sync-replayed / sync-drained / sync-failed` を通知。

最長保持時間は 24 時間 (`maxRetentionTime: 24*60` 分)。

### 動作確認

```bash
npm run build && npm run start
```

DevTools → Application → Service Workers / Manifest / IndexedDB で状態を確認。Network → Offline チェックでフォールバックと BG sync を試せる。

> dev サーバーでは Service Worker は無効化されている (`next.config.ts` の `disable: process.env.NODE_ENV === "development"`)。

## テスト

- **ユニット / コンポーネント**: `src/components/ui/*.test.tsx` を Vitest + JSDOM で実行
- **Storybook**: `src/components/ui/*.stories.tsx`。`npm run test:storybook` で test-runner、`npm run chromatic` でビジュアル回帰
- **E2E**: `tests/e2e/*.spec.ts` を Playwright で実行。グローバルセットアップで自動マイグレーション + シード
- **a11y**: `tests/e2e/a11y-audit.spec.ts`、`a11y-keyboard.spec.ts` で axe-core を流す
- **Lighthouse**: ローカル Chrome を起動して a11y / perf スコアを取得

## 関連ドキュメント

- [`docs/cli-ui-gap.md`](docs/cli-ui-gap.md) — day2-inventory CLI と UI の機能差分
- [`docs/cloudflare-workers-d1-migration.md`](docs/cloudflare-workers-d1-migration.md) — Cloudflare Workers + D1 への移行メモ
