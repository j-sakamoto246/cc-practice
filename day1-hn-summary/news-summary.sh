#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

複数ニュースソースからトップ記事を取得し、スコア正規化した統合ランキングを出力します。

Options:
  --help               このヘルプを表示して終了
  --sources SOURCES    カンマ区切りのソース名（デフォルト: hn）
                       指定可能: hn, reddit, lobsters, devto
  --top N              表示件数（デフォルト: 10）
  --format FORMAT      出力形式: markdown / json（デフォルト: markdown）
  --diff               前回の実行との差分を表示（新着・消滅記事）
  --trend              過去 7 日間のソース別トレンドを表示
  --no-history         DB への保存をスキップ（ドライラン用）

依存コマンド: curl, jq
EOF
}

SOURCES="hn"
TOP_N=10
FORMAT="markdown"
SHOW_DIFF=false
SHOW_TREND=false
SAVE_HISTORY=true

while [[ $# -gt 0 ]]; do
  case "${1:-}" in
    --help)    usage; exit 0 ;;
    --sources)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --sources にはソース名を指定してください。" >&2
        exit 1
      fi
      SOURCES="$2"
      shift
      ;;
    --top)
      if [[ -z "${2:-}" || ! "${2}" =~ ^[0-9]+$ ]]; then
        echo "Error: --top には正の整数を指定してください。" >&2
        exit 1
      fi
      TOP_N="$2"
      shift
      ;;
    --format)
      if [[ -z "${2:-}" || ! "${2}" =~ ^(markdown|json)$ ]]; then
        echo "Error: --format には markdown / json を指定してください。" >&2
        exit 1
      fi
      FORMAT="$2"
      shift
      ;;
    --diff)        SHOW_DIFF=true ;;
    --trend)       SHOW_TREND=true ;;
    --no-history)  SAVE_HISTORY=false ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
  shift
done

# 共通ライブラリとアダプタを読み込み
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

VALID_SOURCES="hn reddit lobsters devto"

# ソースをカンマで分割して配列に
IFS=',' read -ra source_list <<< "$SOURCES"

# ソース名のバリデーション
for src in "${source_list[@]}"; do
  if ! echo "$VALID_SOURCES" | grep -qw "$src"; then
    echo "Error: 不明なソース '${src}'。指定可能: ${VALID_SOURCES}" >&2
    exit 1
  fi
done

# 各アダプタを読み込み・実行し、結果を収集
all_results="[]"
for src in "${source_list[@]}"; do
  # shellcheck source=lib/adapter_hn.sh
  source "${SCRIPT_DIR}/lib/adapter_${src}.sh"

  echo "Fetching from ${src}..." >&2
  if result=$("adapter_${src}_fetch"); then
    normalized=$(echo "$result" | normalize_scores)
    all_results=$(echo "$all_results" "$normalized" | jq -s 'add')
  else
    echo "Warning: ${src} からの取得に失敗しました。スキップします。" >&2
  fi
done

# 結果が空の場合
if [[ $(echo "$all_results" | jq 'length') -eq 0 ]]; then
  echo "Error: どのソースからもデータを取得できませんでした。" >&2
  exit 1
fi

# 統合ランキング
ranked=$(echo "$all_results" | merge_and_rank "$TOP_N")

# ── 履歴保存・差分検出 ────────────────────────────────
# shellcheck source=lib/history.sh
source "${SCRIPT_DIR}/lib/history.sh"
history_init

if $SHOW_DIFF; then
  history_diff "news-summary" "$SOURCES" "$ranked"
fi

if $SAVE_HISTORY; then
  history_save_run "news-summary" "$SOURCES" "$ranked" || \
    echo "Warning: 履歴の保存に失敗しました。" >&2
fi

DATE=$(date '+%Y-%m-%d')

case "$FORMAT" in

  markdown)
    echo ""
    echo "## News Summary (${DATE}) — 統合ランキング トップ ${TOP_N}"
    echo ""
    echo "| # | Source | Title | Score | Normalized | Comments |"
    echo "|---|---|---|---|---|---|"
    echo "$ranked" | jq -r '
      to_entries[] |
      "| \(.key + 1) | \(.value.source) | [\(.value.title)](\(.value.url)) | \(.value.score) | \(.value.normalized_score) | \(.value.comments) |"
    '
    ;;

  json)
    echo "$ranked" | jq '[to_entries[] | {
      rank: (.key + 1),
      source: .value.source,
      title: .value.title,
      url: .value.url,
      score: .value.score,
      normalized_score: .value.normalized_score,
      comments: .value.comments
    }]'
    ;;

esac

if $SHOW_TREND; then
  history_trend "news-summary" "$SOURCES"
fi
