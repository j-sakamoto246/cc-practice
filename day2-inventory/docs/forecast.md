# 需要予測エンジン

過去の出庫履歴 (`stock_movements`) から日次需要を集計し、移動平均・標本標準偏差・安全在庫・発注点・EOQ・推奨発注量を算出する。Markdown サマリー、Mermaid グラフ、CSV をまとめて出力する。

## 概要

- **データソース**: `stock_movements` の `type='out'` 行を `date(created_at)` で日次集計（出庫がない日は 0 として補完）
- **対象スコープ**: 全商品 / 単一商品（`--sku`）、全倉庫合算 / 単一倉庫（`--warehouse-id`）
- **出力**: 標準出力に Markdown サマリー + Mermaid `xychart-beta` ブロック、`--csv <path>` で CSV ファイル（デフォルト `forecast.csv`）

## 使い方

```bash
# 単一商品（時系列 Mermaid グラフ＋CSV）
inventory forecast --sku MBP-2024 --days 30

# 全商品（推奨発注量 Top20 を Mermaid バーチャート＋CSV）
inventory forecast --days 60 --csv reports/forecast.csv

# 倉庫を絞る・信頼水準を変える
inventory forecast --warehouse-id wh-tokyo --confidence 0.99 --days 90

# 発注/保管コスト前提を変えて EOQ を再計算
inventory forecast --sku MBP-2024 --order-cost 5000 --holding-rate 0.30
```

### オプション一覧

| オプション | デフォルト | 説明 |
| --- | --- | --- |
| `--sku <sku>` | なし | 対象 SKU。省略時は全商品 |
| `--warehouse-id <id>` | なし | 対象倉庫 ID。省略時は全倉庫合算 |
| `--days <n>` | `30` | ルックバック日数 N |
| `--confidence <c>` | `0.95` | 信頼水準（`0.80` / `0.85` / `0.90` / `0.95` / `0.99` のみ） |
| `--order-cost <s>` | `1000` | 1 回あたり発注コスト S（円） |
| `--holding-rate <h>` | `0.20` | 年間保管コスト率 H（原価に対する比率） |
| `--csv <path>` | `forecast.csv` | CSV 出力先 |

## 計算ロジック

### 入力前提

| 記号 | 意味 | 取得元 |
| --- | --- | --- |
| `N` | ルックバック日数 | `--days` |
| `L` | リードタイム（日） | `products.lead_time_days` |
| `z` | 信頼水準に対応する標準正規分位点 | `--confidence` から決定 |
| `S` | 1 回あたり発注コスト | `--order-cost` |
| `H_rate` | 年間保管コスト率 | `--holding-rate` |
| `cost` | 商品原価 | `products.cost` |

### z テーブル

| 信頼水準 | z |
| --- | --- |
| 0.80 | 1.282 |
| 0.85 | 1.440 |
| 0.90 | 1.645 |
| 0.95 | 1.960 |
| 0.99 | 2.576 |

これ以外を指定するとエラー。

### 統計量

直近 `N` 日の日次出庫量 `d_1, d_2, ..., d_N`（出庫がない日は 0）から、

- **平均日次需要**: `μ = mean(d_i)`
- **標本標準偏差**（n-1 で割る）: `σ = √(Σ(d_i - μ)² / (N - 1))`
- **信頼区間**: `[max(0, μ - z·σ), μ + z·σ]`

### 安全在庫・発注点

- **安全在庫**: `SS = z · σ · √L`
- **発注点 (Reorder Point)**: `ROP = μ · L + SS`

リードタイム `L` 中の需要は平均 `μ·L`、標準偏差 `σ·√L` の正規分布で近似する前提。

### EOQ（経済発注量）

年間需要 `D = μ · 365`、年間単位保管コスト `H = cost · H_rate` として、

- **EOQ**: `Q* = √(2·D·S / H)`
- ただし `D = 0` または `H = 0` のときは `EOQ = 0`

### 推奨発注量

```
on_hand    = SUM(inventory.quantity)  -- 倉庫指定時はそのスコープのみ
if ROP > 0 and on_hand <= ROP:
    recommended = max(ROP - on_hand, EOQ)
else:
    recommended = 0
```

「発注点を割っているなら、不足分または EOQ のいずれか大きい方を発注」する。これにより、わずかに発注点を下回っただけでも EOQ 単位の発注が推奨され、発注頻度が抑えられる。

## 出力フォーマット

### 1. Markdown サマリー（標準出力）

```
# 需要予測レポート

- 期間: 2026-03-29 〜 2026-04-27 (30日)
- 信頼水準: 95% (z=1.960)
- 発注コスト: 1000 円 / 年間保管コスト率: 20.0%
- 倉庫: 全倉庫合算

## サマリー

 SKU      | 商品名       | 現在庫 | 平均/日 | SD   | L(日) | 安全在庫 | 発注点 | EOQ   | 推奨発注量
----------+--------------+--------+---------+------+-------+----------+--------+-------+------------
 MBP-2024 | MacBook Pro  | 12     | 3.20    | 1.45 | 7     | 7.5      | 30.0   | 184.6 | 184.6
```

### 2. Mermaid グラフ（標準出力）

- **単一商品（`--sku` 指定時）**: 日次需要をバー、平均・上限・下限を 3 本のラインで重ねた `xychart-beta`
- **全商品**: 推奨発注量上位 20 件のバーチャート

### 3. CSV ファイル

`--csv <path>` で指定した先に書き出す。デフォルトはカレントディレクトリの `forecast.csv`。

カラム:

```csv
sku,date,daily_demand,moving_avg,upper_ci,lower_ci,safety_stock,reorder_point,eoq,recommended_order
```

各商品 × 各日（`N` 日分）が 1 行。商品ごとの集計値（`moving_avg` 以降）は同一商品行間で同じ値を繰り返す（gnuplot 等で扱いやすくするため）。gnuplot の例：

```gnuplot
set datafile separator ","
plot "forecast.csv" using 0:3 with boxes title "demand", \
     "" using 0:4 with lines title "mean", \
     "" using 0:5 with lines title "upper", \
     "" using 0:6 with lines title "lower"
```

## リードタイム管理

`products.lead_time_days` は migration 002 で追加された。デフォルト値は `7`。

```bash
# 特定商品のリードタイムを変更
inventory product set-lead-time --sku MBP-2024 --days 14
```

## 設計判断・限界

- **倉庫横断で需要を合算**: リードタイムは商品単位で固定値、需要のばらつきは合算した方がサンプル数が増えて予測安定性が上がる、という判断。倉庫別の傾向を見たいときは `--warehouse-id` で絞る
- **欠損日は 0 補完**: `stock_movements` に出庫レコードがない日＝需要 0 として扱う（休業日・データ抜け を区別しない）。長期休業を含む期間で `--days` を取ると平均が下振れする点に注意
- **標本 SD（n-1）**: 母集団 SD（n で割る）ではなく標本 SD を採用。`N=1` の場合は `σ=0` 扱い
- **季節性・トレンド非考慮**: 単純移動平均のみ。需要に強い季節性がある場合は `--days` を 1 周期分に合わせる運用でカバーする想定。指数平滑・ARIMA 等は未実装
- **発注コスト・保管コスト率**: DB に持たせず引数化。業界・契約条件で大きく変動するため、固定値化するメリットが薄いという判断

## 関連ファイル

- `src/modules/forecast.ts` — 計算ロジック
- `src/cli/forecast.cmd.ts` — CLI コマンド・出力整形
- `migrations/002_add_lead_time_to_products.sql` — `lead_time_days` 追加
- `tests/modules/forecast.test.ts` — 単体テスト
