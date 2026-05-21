# CLI と UI の機能差分

比較元:

- `../day2-inventory/COMMANDS.md`
- `../day2-inventory/src/cli/*.cmd.ts`

比較先:

- `src/app/**`
- `src/app/api/**`
- `src/modules/**`

## 実装済み

| CLI コマンド                             | UI / API 側の状況                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `inventory product add`                  | 商品追加 UI/API あり。                                                                                  |
| `inventory product list`                 | 商品一覧 UI/API あり。                                                                                  |
| `inventory product update`               | 商品編集 UI/API あり (`minQuantity` / `leadTimeDays` も編集可)。                                        |
| `inventory product delete`               | 商品削除 UI/API あり。                                                                                  |
| `inventory product set-lead-time`        | 商品編集ダイアログでリードタイムを変更可能。`PATCH /api/products/[id]` が `leadTimeDays` を受け付ける。 |
| `inventory stock in`                     | 入庫 UI/API あり。`POST /api/stock` が `lot_code` / `expiry_date` も受け付け、ロット入庫に対応。        |
| `inventory stock in --lot-code --expiry` | 入庫ダイアログでロットコードと期限を入力可能。                                                          |
| `inventory stock out`                    | 出庫 UI/API あり。                                                                                      |
| `inventory stock status`                 | `/api/stock` で在庫一覧、`/stock` ページ + `/stock/inventory` で UI 表示。                              |
| `inventory stock alerts`                 | ダッシュボードに在庫アラート表示あり (`/api/dashboard/alerts`)。                                        |
| `inventory stock set-threshold`          | 商品編集ダイアログで最低在庫を変更可能。`PATCH /api/products/[id]` が `minQuantity` を受け付ける。      |
| `inventory stock transfer`               | `/stock/transfer` ページ + `POST /api/stock/transfer` あり。                                            |
| `inventory stock lots`                   | `/stock/lots` ページ + `GET /api/stock/lots` あり。                                                     |
| `inventory stock expiring`               | `GET /api/stock/expiring` あり (UI は `/stock/lots` 内に組み込み)。                                     |
| `inventory order create`                 | 受注作成 UI/API あり。                                                                                  |
| `inventory order list`                   | 受注一覧 UI/API あり。                                                                                  |
| `inventory order status`                 | 受注詳細表示とステータス変更 UI/API あり (`/api/orders/[id]`)。                                         |
| `inventory order ship`                   | 発送処理 UI/API あり (`/api/orders/[id]/ship`)。                                                        |
| `inventory import products --file`       | `/products/import` 画面 + `POST /api/products/import` で CSV インポートに対応。                         |
| `inventory campaign create/list/apply`   | `/campaigns` ページ + `/api/campaigns` / `/api/campaigns/apply` あり。                                  |
| `inventory accounting report`            | `/reports` + `GET /api/reports/sales-report` あり。                                                     |
| `inventory accounting inventory-value`   | `GET /api/reports/inventory-value` + `/reports` 内で表示。                                              |
| `inventory accounting export`            | `GET /api/reports/export` / `/api/reports/inventory-export` で CSV エクスポート可能。                   |
| `inventory forecast`                     | `/forecast` ページ + `GET /api/forecast` あり (需要予測 + 発注推奨)。                                   |

## 未実装 / 差分が残る項目

| CLI コマンド                                            | UI / API 側の状況                                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `inventory migrate up/down/status/create`               | マイグレーション管理 UI/API はない。起動時に `initDatabase()` が冪等に実行するのみ。                              |
| `inventory serve`                                       | CLI としての REST サーバ起動コマンドはない。Next.js アプリの `npm run dev` / `npm start` に置き換わっている扱い。 |
| 受注一覧の `--status` / `--customer` 相当               | UI 上のクライアント絞り込みとして実装されているが、`GET /api/orders` 側にクエリパラメータは未実装。               |
| 商品一覧 `--format json` や会計レポート `--format json` | UI 経由では用途がないため未対応。外部連携 API として必要なら別途設計が必要。                                      |

## 補足

- `src/modules/**` の day2 由来ビジネスロジックは大半が API Route + UI から呼ばれており、未露出のロジックはほぼ残っていない。
- マイグレーションは `src/db/migrator.ts` が起動時に自動適用する。手動制御が必要なら CLI 復活より `scripts/` 配下にユーティリティ追加が現実的。
