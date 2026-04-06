# HN Summary

[![CI](https://github.com/j-sakamoto/cc-practice/actions/workflows/test.yml/badge.svg)](https://github.com/j-sakamoto/cc-practice/actions/workflows/test.yml)

Hacker News のトップ記事を取得し、スコア/コメント比で並べ替えた Markdown レポートを生成するスクリプト群。シェルスクリプト版と Deno（TypeScript）版の両方を収録。

## 使い方

### シェルスクリプト版（`main` ブランチ）

```bash
# 記事データのみ取得・表示（Markdown テーブル）
./hn-top10.sh

# 記事取得 + Claude Code による日本語サマリー生成
./hn-summary.sh
```

依存: `curl`, `jq`, `claude`（`hn-summary.sh` のみ）

### Deno 版（`feature/deno-rewrite` ブランチ）

```bash
# 記事データのみ取得・表示（Markdown テーブル）
cd deno && deno task hn-top10

# 出力形式を指定
deno run --allow-net main.ts --format json
deno run --allow-net main.ts --format html
deno run --allow-net main.ts --min-comments 10

# 記事取得 + Claude Code による日本語サマリー生成
deno task summary

# ユニットテスト（ネットワーク不要）
deno task test
```

依存: `deno`（fetch API 内蔵のため `curl`/`jq` 不要）、`claude`（`summary.ts` のみ）

## CI

push / PR のたびに以下が自動実行されます。

1. **ShellCheck** — 全シェルスクリプトの静的解析
2. **test_scripts.sh** — 出力フォーマットの結合テスト

テスト失敗時は Slack に通知されます（`SLACK_WEBHOOK_URL` シークレット要設定）。
