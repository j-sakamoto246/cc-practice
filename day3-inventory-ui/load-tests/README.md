# 負荷テスト (k6)

day3-inventory-ui の API レイヤを [k6](https://k6.io/) で負荷試験するための基盤。

- 主要 3 系統 (商品一覧 / 在庫操作 / 受注作成) を **10 → 50 → 100 VU** で段階加重
- SLO: `http_req_duration p(95) < 500ms`、`http_req_failed rate < 1%`
- 専用 DB / 専用ポートで dev・e2e を汚さない
- 結果は `load-tests/reports/*.html` (git-ignored) として保存

---

## 1. セットアップ

### k6 のインストール (Ubuntu / WSL2)

```bash
sudo gpg -k
sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install -y k6
k6 version   # → v1.x.x が表示されれば OK
```

公式手順: <https://grafana.com/docs/k6/latest/set-up/install-k6/>

### 専用 DB の初期化

```bash
npm run loadtest:db:reset
```

`data/load-test.db` を作り直し、`scripts/seed-dummy.mjs` で商品 6 件・倉庫 3 件・受注 4 件等を投入する。

---

## 2. サーバ起動

ローカル計測用 (dev サーバ):

```bash
npm run loadtest:server          # PORT=3200, DATABASE_URL=file:./data/load-test.db
```

**本番計測時**は HMR / オンデマンドコンパイルが入らない production build を使う:

```bash
npm run build
npm run loadtest:server:prod
```

`http://127.0.0.1:3200` で疎通を確認してから次に進む。

---

## 3. 実行

ターミナルを分けて以下を実行する。

```bash
npm run loadtest:smoke        # 1 VU / 30s 疎通確認
npm run loadtest:products     # GET /api/products 単独 (10→50→100 VU)
npm run loadtest:stock        # POST /api/stock 単独
npm run loadtest:orders       # POST /api/orders 単独
npm run loadtest              # 上記 3 つを並列実行 (ピーク 300 VU 相当, 約 6 分)
```

実行ごとに `load-tests/reports/<scenario>-<timestamp>.html` と `.json` が生成される。ブラウザで HTML を開くとエンドポイント別の p95/p99・グラフが確認できる。

### 環境変数

| 変数            | 既定値                  | 用途                      |
| --------------- | ----------------------- | ------------------------- |
| `BASE_URL`      | `http://127.0.0.1:3200` | 対象サーバ URL            |
| `SCENARIO_NAME` | `load-test`             | レポートファイルの prefix |

例: 既存サーバへ向け直す場合 `BASE_URL=http://staging.example.com k6 run load-tests/scenarios/products-list.js`

---

## 4. ボトルネック分析の方法論

HTML レポートと `.json` を以下の **6 ステップ**で読み解く。

### Step 1: エンドポイント別 p95/p99

`http_req_duration{endpoint:products}` / `{endpoint:stock}` / `{endpoint:orders}` を比較し、**最も遅いエンドポイント**を特定する。

- 読み取りが書き込みより遅い → キャッシュ未活用やレスポンスサイズの肥大
- 書き込みが読み取りより著しく遅い → DB ロック / トランザクション設計

### Step 2: VU 段階ごとの劣化曲線

10 / 50 / 100 VU 区間で p95 がどう変化するか:

- **線形** → 容量不足 (水平スケールで解消)
- **階段状** → 飽和点が露呈 (connection pool / file descriptor 等)
- **指数的** → コンテンション (ロック競合 / GC)

### Step 3: エラー率の跳ね地点

`http_req_failed` が急増する VU 数を記録。サーバまたは DB の限界値の目安になる。500 番台が出始めたら必ず原因を切り分ける (timeout / DB busy / OOM)。

### Step 4: SQLite / libSQL 特有のチェック

- 書き込み (`/api/stock`, `/api/orders`) が読み取りより著しく遅い → **SQLite は単一ライター**である制約が顕在化
- `data/load-test.db-wal` の肥大 → WAL チェックポイントが追いついていない
- `SQLITE_BUSY` が出ていないかサーバログを grep

### Step 5: Next.js 16 特有のチェック

- `next dev` と `next start` (本番ビルド) を**両方計測**して差分を見る (HMR / オンデマンドコンパイル分が差として出る)
- `/api/products` のような READ-only エンドポイントに [route segment caching](../node_modules/next/dist/docs) や `unstable_cache` が効くか検討
- ストリーミング有無で TTFB がどう変わるか

### Step 6: OS リソース

測定中に `top` / `htop` を並走させ、サーバプロセスの **CPU%・RSS・FD 数**を記録。CPU 飽和 → コード最適化、メモリ膨張 → リーク、FD 上限 → `ulimit -n` の確認。

### 改善提案チェックリスト (典型)

- [ ] 本番ビルド (`next build && next start`) で測定したか
- [ ] DB へのコネクション再利用 / pooling
- [ ] 書き込みのバッチ化 / トランザクション粒度の見直し
- [ ] N+1 クエリの解消 (`/api/orders` の order_items 取得など)
- [ ] 読み取りに `unstable_cache` / ETag を導入
- [ ] レスポンスサイズの削減 (不要フィールド除去)
- [ ] `Content-Encoding: gzip / br` の有効化
- [ ] SQLite `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` の確認

---

## 5. 出力ファイル

| パス                        | 内容                            |
| --------------------------- | ------------------------------- |
| `load-tests/reports/*.html` | benc-uk/k6-reporter による HTML |
| `load-tests/reports/*.json` | フルメトリクス JSON (CI 連携用) |
| stdout                      | k6 標準の text summary          |

`reports/` は `.gitignore` 済み。所見をまとめたい時は `docs/load-test-findings.md` に追記する。

---

## 6. CI

`.github/workflows/load-test.yml` に手動トリガー (`workflow_dispatch`) のワークフローを用意。`scenario` 入力で対象シナリオを選び、HTML/JSON を artifact としてダウンロードできる。

```text
Actions → Load test → Run workflow → scenario=full-suite
```

CI でも production build (`next build && next start`) で計測している。

---

## 7. トラブルシュート

| 症状                                  | 対処                                                         |
| ------------------------------------- | ------------------------------------------------------------ |
| `connect ECONNREFUSED 127.0.0.1:3200` | サーバ未起動。`npm run loadtest:server` を別ターミナルで実行 |
| `POST /api/stock` が 409 連発         | 在庫が枯渇。`npm run loadtest:db:reset` で再シード           |
| HTML が壊れて開けない                 | `load-tests/reports/` を消して再実行                         |
| WSL2 で k6 が遅い                     | `wsl --shutdown` 後にリトライ、または Windows ホストから実行 |
| `too many open files`                 | `ulimit -n 65536` をシェルに設定                             |
