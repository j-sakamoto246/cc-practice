# コマンドリファレンス

`npm run build && npm link` 後は `inventory` コマンドとして直接実行可能。
開発中は `npm run dev -- <コマンド>` でも実行可能（ビルド不要）。

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

## 在庫管理 (stock)

```bash
# 入庫
inventory stock in --sku "MBP-2024" --quantity 50 --warehouse "東京倉庫"
inventory stock in --sku "MBP-2024" --quantity 10 --warehouse "大阪倉庫" --note "追加発注分"

# 出庫
inventory stock out --sku "MBP-2024" --quantity 5 --warehouse "東京倉庫"

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

## 受注ステータスの遷移

```
pending → confirmed → processing → shipped → delivered
  ↓          ↓           ↓
cancelled  cancelled   cancelled
```
