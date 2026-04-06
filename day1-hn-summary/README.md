# HN Summary

[![CI](https://github.com/j-sakamoto/cc-practice/actions/workflows/test.yml/badge.svg)](https://github.com/j-sakamoto/cc-practice/actions/workflows/test.yml)

Hacker News のトップ記事を取得し、スコア/コメント比で並べ替えた Markdown レポートを生成します。
HN / Lobsters / Dev.to / Reddit の複数ソースに対応したリアルタイム WebSocket サーバーも提供します。
Deno（TypeScript）版がメイン実装。シェルスクリプト版は `shell/` にアーカイブ。

## 使い方

```bash
# リアルタイムフィードサーバー（HN / Lobsters / Dev.to / Reddit + Claude 日本語訳）
deno task server
# → http://localhost:8080 をブラウザで開く

# 記事データのみ取得・表示（Markdown テーブル）
deno task hn-top10

# 出力形式を指定
deno run --allow-net main.ts --format json
deno run --allow-net main.ts --format html
deno run --allow-net main.ts --min-comments 10

# 記事取得 + Claude Code による日本語サマリー生成
deno task summary

# ユニットテスト（ネットワーク不要）
deno task test
```

依存: `deno`（fetch API 内蔵のため `curl`/`jq` 不要）、`claude`（`server.ts` / `summary.ts` のみ）

## アーカイブ（シェルスクリプト版）

```bash
# shell/ ディレクトリに旧バージョンを保存
shell/hn-top10.sh
shell/hn-summary.sh
```

依存: `curl`, `jq`, `claude`（`hn-summary.sh` のみ）

## CI

push / PR のたびに以下が自動実行されます。

1. **ShellCheck** — `shell/` 配下のシェルスクリプトの静的解析
2. **deno task test** — Deno ユニットテスト（41 件）
