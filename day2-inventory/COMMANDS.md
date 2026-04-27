# コマンドリファレンス

`npm run build && npm link` 後は `inventory` コマンドとして直接実行可能。
開発中は `npm run dev -- <コマンド>` でも実行可能（ビルド不要）。

> DB スキーマ・データフローの詳細は [docs/database.md](./docs/database.md) を参照。

> **注意**: `src/` を編集したら `npm run build` してから `inventory` を使うこと。

## 商品管理 (product)

```bash
# 商品を追加
inventory product add --name "MacBook Pro" --sku "MBP-2024" --price 298000
inventory product add --name "Magic Mouse" --sku "MM-001" --price 13800 --cost 5000 --description "ワイヤレスマウス"

# 商品一覧
inventory product list
inventory product list --format json

# 商品を更新
inventory product update --sku "MBP-2024" --price 278000
inventory product update --sku "MBP-2024" --name "MacBook Pro M4" --cost 200000

# 商品を削除
inventory product delete --sku "MBP-2024"
```

## 一括インポート (import)

```bash
# 商品をCSVから一括インポート
inventory import products --file products.csv
```

CSVヘッダー:

```csv
sku,name,price,cost,description,min_quantity
MBP-2024,MacBook Pro,298000,200000,ノートPC,5
```

## 在庫管理 (stock)

```bash
# 入庫
inventory stock in --sku "MBP-2024" --quantity 50 --warehouse "東京倉庫"
inventory stock in --sku "MBP-2024" --quantity 10 --warehouse "大阪倉庫" --note "追加発注分"

# 出庫
inventory stock out --sku "MBP-2024" --quantity 5 --warehouse "東京倉庫"

# 倉庫間移動
inventory stock transfer --sku "MBP-2024" --from "東京倉庫" --to "大阪倉庫" --quantity 5

# 在庫状況
inventory stock status
inventory stock status --sku "MBP-2024"
inventory stock status --warehouse "東京倉庫"
inventory stock status --sku "MBP-2024" --warehouse "東京倉庫"
```

## 受注管理 (order)

```bash
# 受注を作成 (明細: SKU:数量 をカンマ区切り)
inventory order create --customer "山田太郎" --items "MBP-2024:2,MM-001:3"

# 受注一覧
inventory order list
inventory order list --status pending
inventory order list --customer "山田"

# 受注詳細 (明細・発送情報を表示)
inventory order status --order-id <受注ID>

# 出荷処理
inventory order ship --order-id <受注ID> --carrier "ヤマト運輸" --tracking "1234-5678-9012"
```

## キャンペーン管理 (campaign)

```bash
# キャンペーンを作成 (割引率)
inventory campaign create --name "夏セール" --type percentage --value 20 --start 2026-07-01 --end 2026-08-31

# キャンペーンを作成 (固定額割引)
inventory campaign create --name "500円引きクーポン" --type fixed --value 500 --start 2026-04-01 --end 2026-04-30

# キャンペーン一覧
inventory campaign list
inventory campaign list --active

# 受注にキャンペーンを適用
inventory campaign apply --order-id <受注ID> --campaign-id <キャンペーンID>
```

## 会計処理 (accounting)

```bash
# 売上レポート
inventory accounting report --from 2026-04-01 --to 2026-04-30
inventory accounting report --from 2026-04-01 --to 2026-04-30 --format json

# 在庫評価
inventory accounting inventory-value

# 売上データをCSVエクスポート
inventory accounting export --from 2026-04-01 --to 2026-04-30 --output sales.csv
```

## マイグレーション (migrate)

スキーマ変更は `migrations/NNN_<name>.sql` で管理する。各ファイルは `-- +migrate Up` と `-- +migrate Down` のセクションを持ち、適用済みバージョンは `schema_migrations` テーブルで追跡される。

```bash
# 適用状況を確認 ([applied] / [pending])
inventory migrate status

# 未適用のマイグレーションを全て適用
inventory migrate up

# 直前に適用したマイグレーションを 1 段ロールバック
inventory migrate down

# 新規マイグレーションファイルを生成 (002_add_xxx.sql のテンプレートを作成)
inventory migrate create add-xxx
```

> **補足**: 通常コマンド (`product add` 等) の起動時は `initDatabase()` が未適用マイグレーションを自動適用する。本番運用では明示的に `migrate up` を実行してから API サーバ等を起動するのが安全。`migrate down` は 1 段ずつのロールバックなので、複数戻したい場合は連続実行する。

### マイグレーションファイルの書式

```sql
-- +migrate Up

CREATE TABLE alerts (
  id         TEXT PRIMARY KEY,
  ...
);
CREATE INDEX idx_alerts_xxx ON alerts(xxx);

-- +migrate Down

DROP TABLE alerts;
```

各 migration は `BEGIN`/`COMMIT` で囲んで実行されるため、Up/Down が途中で失敗した場合は自動的にロールバックされる。

## 受注ステータスの遷移

```
pending → confirmed → processing → shipped → delivered
  ↓          ↓           ↓
cancelled  cancelled   cancelled
```
