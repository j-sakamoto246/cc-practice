# Claude Code 研修ワークスペース

## day1-hn-summary

HN / Lobsters / Dev.to / Reddit の複数ソースからニュースを取得し、スコア正規化した統合ランキングを生成する。
WebSocket サーバーでリアルタイム配信、Claude による日本語訳付き。
**Deno（TypeScript）版がメイン。** 旧シェルスクリプト版は `shell/` にアーカイブ。

### セットアップ

```bash
cd day1-hn-summary

# Deno インストール（未インストールの場合）
curl -fsSL https://deno.land/install.sh | sh
```

### コマンド集

```bash
# リアルタイムフィードサーバー（HN / Lobsters / Dev.to / Reddit + Claude 日本語訳）
deno task server
# → http://localhost:8080 をブラウザで開く（停止: Ctrl + C）

# HN トップ記事を Markdown テーブルで表示
deno task hn-top10

# フォーマット指定（markdown / html / json）
deno run --allow-net main.ts --format json

# コメント数フィルタ（コメント10件以上のみ）
deno run --allow-net main.ts --min-comments 10

# HN記事 + Claude による日本語サマリー生成（claude CLI 必須）
deno task summary
```

### テスト

```bash
# ユニットテスト（ネットワーク不要・高速）
deno task test
```

### 依存コマンド

| コマンド | 用途 | 必須スクリプト |
|---|---|---|
| `deno` | 実行・テスト（fetch 内蔵のため curl/jq 不要） | 全スクリプト |
| `claude` | 日本語訳・サマリー生成 | `server.ts` / `summary.ts` のみ |

### アーカイブ（旧シェルスクリプト版）

`shell/` ディレクトリに旧バージョンを保存。依存: `curl`, `jq`

```bash
shell/hn-top10.sh
shell/hn-summary.sh
shell/news-summary.sh
```
