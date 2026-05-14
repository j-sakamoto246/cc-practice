# CLI と UI の機能差分

比較元:

- `../day2-inventory/COMMANDS.md`
- `../day2-inventory/src/cli/*.cmd.ts`

比較先:

- `src/app/**`
- `src/app/api/**`
- `src/modules/**`

## 未実装 / 不足している機能

| CLI コマンド | UI / API 側の状況 |
| --- | --- |
| `inventory import products --file` | CSV 商品インポート画面/API がない。`src/modules/product-import.ts` は存在するが未露出。 |
| `inventory product set-lead-time` | リードタイム更新 UI/API がない。`setLeadTime()` は存在する。 |
| `inventory stock transfer` | 倉庫間移動 UI/API がない。`stockTransfer()` は存在する。 |
| `inventory stock lots` | ロット一覧 UI/API がない。`listLots()` は存在する。 |
| `inventory stock expiring` | 期限切れ/期限間近ロット UI/API がない。`getExpiringLots()` は存在する。 |
| `inventory stock in --lot-code --expiry` | 入庫 UI/API はあるが、ロットコードと期限の入力に対応していない。 |
| `inventory stock set-threshold` | 既存商品の最低在庫数更新 UI/API がない。商品追加時の `minQuantity` はあるが、編集画面では更新できない。 |
| `inventory stock status` | `/api/stock` は在庫一覧を返すが、UI に現在庫一覧として表示されていない。 |
| `inventory campaign create/list/apply` | キャンペーン管理 UI/API がない。`src/modules/campaign.ts` は存在する。 |
| `inventory accounting report` | 売上レポート UI/API がない。ダッシュボードには簡易売上グラフのみある。 |
| `inventory accounting inventory-value` | ダッシュボードに総在庫金額はあるが、CLI 相当の明細付き在庫評価 UI/API はない。 |
| `inventory accounting export` | 売上データ CSV エクスポート UI/API がない。 |
| `inventory forecast` | 需要予測/発注推奨 UI/API がない。`src/modules/forecast.ts` は存在する。 |
| `inventory migrate up/down/status/create` | マイグレーション管理 UI/API がない。Next.js 側では起動時自動マイグレーションのみ。 |
| `inventory serve` | CLI としての REST サーバ起動コマンドはない。Next.js アプリの `npm run dev` / `npm run start` に置き換わっている扱い。 |

## 実装済みに見える機能

| CLI コマンド | UI / API 側の状況 |
| --- | --- |
| `inventory product add` | 商品追加 UI/API あり。 |
| `inventory product list` | 商品一覧 UI/API あり。 |
| `inventory product update` | 商品編集 UI/API あり。ただし最低在庫数とリードタイムは編集不可。 |
| `inventory product delete` | 商品削除 UI/API あり。 |
| `inventory stock in` | 入庫 UI/API あり。ただしロット情報は未対応。 |
| `inventory stock out` | 出庫 UI/API あり。 |
| `inventory stock alerts` | ダッシュボードに在庫アラート表示あり。 |
| `inventory order create` | 受注作成 UI/API あり。 |
| `inventory order list` | 受注一覧 UI/API あり。 |
| `inventory order status` | 受注詳細表示とステータス変更 UI/API あり。 |
| `inventory order ship` | 発送処理 UI/API あり。 |

## 補足

- 注文一覧の `--status` / `--customer` 相当は UI 上のクライアント絞り込みとして実装されているが、API クエリとしては未実装。
- 商品一覧の `--format json` や会計レポートの `--format json` のような CLI 出力形式オプションは、UI では直接対応不要とみなせる。ただし外部連携 API として必要なら別途設計が必要。
- `src/modules/**` には day2 のビジネスロジックが多く移植済みなので、未実装の多くは API Route と画面の追加で露出できる状態。
