#!/bin/bash

set -euo pipefail

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Hacker News のトップ記事を取得し、Claude Code による日本語サマリーを含む
Markdown レポートを出力します。

Options:
  --help    このヘルプを表示して終了

依存コマンド: curl, jq, claude（Claude Code CLI）
EOF
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATE=$(date '+%Y-%m-%d')

# hn-top10.sh で記事データを取得
hn_table=$("${SCRIPT_DIR}/hn-top10.sh")

# Claude Code CLI でサマリーを生成
summary=$(claude -p "$(cat <<EOF
以下は本日 (${DATE}) の Hacker News スコア/コメント比トップ5記事の一覧です。
各記事のタイトルから内容を推測し、1〜2文の日本語でサマリーを作成してください。
URLへのアクセスは不要です。Markdown の箇条書き形式で出力してください。

${hn_table}
EOF
)")

# Markdown として出力
cat <<EOF
# Hacker News サマリー — ${DATE}

${hn_table}

## 各記事のサマリー（Claude による要約）

${summary}
EOF
