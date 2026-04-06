# HN Summary

[![CI](https://github.com/j-sakamoto/cc-practice/actions/workflows/test.yml/badge.svg)](https://github.com/j-sakamoto/cc-practice/actions/workflows/test.yml)

Hacker News のトップ記事を取得し、スコア/コメント比で並べ替えた Markdown レポートを生成するシェルスクリプト群。

## 使い方

```bash
# 記事データのみ取得・表示（Markdown テーブル）
./hn-top10.sh

# 記事取得 + Claude Code による日本語サマリー生成
./hn-summary.sh
```

## 依存コマンド

- `curl` — HN API への HTTP リクエスト
- `jq` — JSON パース
- `claude` — Claude Code CLI（`hn-summary.sh` のみ）

## CI

push / PR のたびに以下が自動実行されます。

1. **ShellCheck** — 全シェルスクリプトの静的解析
2. **test_scripts.sh** — 出力フォーマットの結合テスト

テスト失敗時は Slack に通知されます（`SLACK_WEBHOOK_URL` シークレット要設定）。
