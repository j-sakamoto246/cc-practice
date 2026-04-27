# データベース アーキテクチャ

libSQL (SQLite 互換) を採用。スキーマは `migrations/NNN_<name>.sql` で管理し、適用済みバージョンは `schema_migrations` テーブルに記録される。

## ER 図

```mermaid
erDiagram
    products ||--o{ inventory        : "在庫キャッシュ"
    products ||--o{ stock_movements  : "入出庫履歴"
    products ||--o{ order_items      : "受注明細"
    warehouses ||--o{ inventory      : "保管"
    warehouses ||--o{ stock_movements: "移動元/先"
    orders ||--o{ order_items        : "明細を持つ"
    orders ||--o{ shipments          : "発送される"

    products {
        TEXT    id          PK
        TEXT    sku         UK
        TEXT    name
        REAL    price
        REAL    cost
        INTEGER min_quantity
        TEXT    created_at
        TEXT    updated_at
    }
    warehouses {
        TEXT id         PK
        TEXT name       UK
        TEXT location
        TEXT created_at
    }
    inventory {
        TEXT    id           PK
        TEXT    product_id   FK
        TEXT    warehouse_id FK
        INTEGER quantity     "CHECK >= 0"
        TEXT    updated_at
    }
    stock_movements {
        TEXT    id             PK
        TEXT    product_id     FK
        TEXT    warehouse_id   FK
        TEXT    type           "'in' | 'out'"
        INTEGER quantity       "CHECK > 0"
        TEXT    reference_type
        TEXT    reference_id
        TEXT    created_at
    }
    orders {
        TEXT id            PK
        TEXT customer_name
        TEXT status        "pending|confirmed|processing|shipped|delivered|cancelled"
        REAL total_amount
        TEXT created_at
        TEXT updated_at
    }
    order_items {
        TEXT    id         PK
        TEXT    order_id   FK "ON DELETE CASCADE"
        TEXT    product_id FK
        INTEGER quantity
        REAL    unit_price
        REAL    subtotal
    }
    shipments {
        TEXT id              PK
        TEXT order_id        FK
        TEXT tracking_number
        TEXT carrier
        TEXT status          "preparing|shipped|in_transit|delivered|returned"
        TEXT shipped_at
        TEXT delivered_at
    }
    campaigns {
        TEXT    id             PK
        TEXT    name
        TEXT    discount_type  "'percentage' | 'fixed'"
        REAL    discount_value
        TEXT    start_date
        TEXT    end_date
        INTEGER active
    }
    transactions {
        TEXT id             PK
        TEXT type           "'sale' | 'purchase' | 'adjustment' | 'refund'"
        REAL amount
        TEXT reference_type
        TEXT reference_id
        TEXT description
        TEXT created_at
    }
    schema_migrations {
        TEXT version    PK
        TEXT name
        TEXT applied_at
    }
```

> `campaigns` と `transactions` は外部キーを持たず、アプリ層から `reference_type` + `reference_id` で多態的に他テーブルを参照する。`schema_migrations` はマイグレーション基盤のメタテーブル。

## テーブルの責務

| テーブル | 役割 | 備考 |
|---|---|---|
| `products` | 商品マスタ | `sku` で一意。soft delete 想定の `is_active` 列は将来追加予定 |
| `warehouses` | 倉庫マスタ | `name` で一意 |
| `inventory` | 商品×倉庫ごとの**現在在庫キャッシュ** | `UNIQUE(product_id, warehouse_id)`。`stock_movements` から再構築可能 |
| `stock_movements` | 入出庫の**追記専用イベントログ** | 在庫の信頼できる唯一の情報源 (single source of truth) |
| `orders` / `order_items` | 受注ヘッダ + 明細 | `order_items.order_id` は `ON DELETE CASCADE` |
| `shipments` | 発送情報 | 1 受注に対して複数の発送を許容 |
| `campaigns` | 割引キャンペーン | 適用ロジックはアプリ層 (`order.applyCampaign`) |
| `transactions` | 会計トランザクション (追記専用) | 売上・購買・調整・返金を統一して記録 |
| `schema_migrations` | マイグレーション履歴 | `migrator.ts` が自動管理 |

## ハイブリッド在庫モデル

`stock_movements` (event log) と `inventory` (cache) の 2 層構造。**全ての在庫変更は単一トランザクション内で 3 テーブルを atomic に更新する**。

### 入庫 (stock in) のシーケンス

```mermaid
sequenceDiagram
    participant User as CLI
    participant Svc as stock service
    participant DB as libSQL

    User->>Svc: inventory stock in --sku --qty --warehouse
    Svc->>DB: BEGIN
    Svc->>DB: INSERT stock_movements (type='in', quantity=qty)
    Svc->>DB: UPDATE inventory SET quantity = quantity + qty
    Svc->>DB: INSERT transactions (type='purchase', amount=qty*cost)
    alt 全て成功
        Svc->>DB: COMMIT
        DB-->>Svc: OK
        Svc-->>User: 入庫完了
    else いずれか失敗
        Svc->>DB: ROLLBACK
        DB-->>Svc: error
        Svc-->>User: エラー (在庫は変化しない)
    end
```

### 倉庫間移動 (stock transfer)

移動元で `out`、移動先で `in` の 2 件を**同一トランザクション**に記録。総在庫量は保存される (invariant)。会計トランザクションは生成されない（社内移動のため）。

```mermaid
flowchart LR
    A[移動元 warehouse_id] -->|stock_movements: type='out'| L[(stock_movements)]
    A -->|inventory.quantity -= qty| I[(inventory)]
    L -->|"内部リファレンス"| L
    B[移動先 warehouse_id] -->|stock_movements: type='in'| L
    B -->|"inventory.quantity += qty<br/>(必要なら INSERT)"| I
```

### キャッシュ整合性の保証

- `inventory.quantity` は **`SUM(stock_movements.quantity * sign(type))`** と一致しなければならない
- この不変条件は `tests/modules/stock.property.test.ts` で property-based に検証されている
- 万一ずれた場合は `stock_movements` から `inventory` を再構築可能

## マイグレーション運用フロー

```mermaid
flowchart TD
    files["migrations/NNN_*.sql<br/>(-- +migrate Up / Down)"]
    loader["migrator.ts<br/>loadMigrations + parseMigration"]
    table[("schema_migrations<br/>(version, applied_at)")]

    files --> loader
    loader --> diff{未適用 version?}
    table --> diff
    diff -->|有り| up["BEGIN<br/>→ Up セクション実行<br/>→ INSERT schema_migrations<br/>→ COMMIT"]
    diff -->|無し| skip[スキップ]
    up -->|失敗| rb[ROLLBACK]
    up -->|成功| done[次の version へ]
```

- `migrate up`: 全 pending を順に適用
- `migrate down`: `schema_migrations` の最新行を 1 件だけロールバック
- `migrate status`: ファイル一覧と `schema_migrations` を突き合わせて表示
- `migrate create <name>`: 次の連番でテンプレートファイルを生成
- 起動時の `initDatabase()` は `migrateUp()` を自動呼び出し（テスト互換のため）。本番では明示的に `migrate up` を実行する運用を推奨

## 設計上の前提

- 全テーブルの主キーは `crypto.randomUUID()` の TEXT
- 日時は ISO 8601 形式の TEXT (`datetime('now')` でデフォルト)
- `updated_at` は DB トリガではなくリポジトリ層で明示的に更新
- `stock_movements` と `transactions` は append-only。物理削除しない
- `PRAGMA foreign_keys = ON` を接続時に毎回設定 (SQLite の既定は OFF)
