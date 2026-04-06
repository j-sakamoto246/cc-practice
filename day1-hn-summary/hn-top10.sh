#!/bin/bash

set -euo pipefail

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Hacker News のトップ記事を取得し、スコア/コメント比で並べ替えて出力します。

Options:
  --help               このヘルプを表示して終了
  --categorize         記事をカテゴリ別にグループ化して出力（claude CLI 使用）
  --min-comments N     コメント数が N 件以上の記事のみを対象にする（デフォルト: 0）
  --format FORMAT      出力形式を指定する: markdown / html / json（デフォルト: markdown）

設定値:
  FETCH_N   API から取得する記事数（デフォルト: 30）
  TOP_N     スコア上位から絞り込む件数（デフォルト: 5）

依存コマンド: curl, jq
依存コマンド（--categorize 使用時のみ）: claude
EOF
}

CATEGORIZE=false
MIN_COMMENTS=0
FORMAT="markdown"

while [[ $# -gt 0 ]]; do
  case "${1:-}" in
    --help)         usage; exit 0 ;;
    --categorize)   CATEGORIZE=true ;;
    --min-comments)
      if [[ -z "${2:-}" || ! "${2}" =~ ^[0-9]+$ ]]; then
        echo "Error: --min-comments には正の整数を指定してください。" >&2
        exit 1
      fi
      MIN_COMMENTS="$2"
      shift
      ;;
    --format)
      if [[ -z "${2:-}" || ! "${2}" =~ ^(markdown|html|json)$ ]]; then
        echo "Error: --format には markdown / html / json を指定してください。" >&2
        exit 1
      fi
      FORMAT="$2"
      shift
      ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
  shift
done

BASE_URL="https://hacker-news.firebaseio.com/v0"
FETCH_N=30   # スコア上位5件を確実に捕捉するため多めに取得
TOP_N=5
MAX_RETRY=3

# リトライ付き curl 関数
# 使い方: fetch_json <url>
# HTTP レスポンスが空または不正な JSON の場合は最大 MAX_RETRY 回リトライ
fetch_json() {
  local url="$1"
  local attempt=1
  local result

  while [[ $attempt -le $MAX_RETRY ]]; do
    result=$(curl -sf "$url" 2>/dev/null || true)
    if echo "$result" | jq empty 2>/dev/null; then
      echo "$result"
      return 0
    fi
    echo "Warning: $url の取得に失敗 (${attempt}/${MAX_RETRY})..." >&2
    attempt=$((attempt + 1))
    sleep 2
  done

  echo "Error: $url を ${MAX_RETRY} 回試みましたが取得できませんでした。" >&2
  return 1
}

echo "Fetching top ${FETCH_N} stories from Hacker News..." >&2

# トップ記事 ID リストを取得
topstories=$(fetch_json "${BASE_URL}/topstories.json") || exit 1

# 上位 FETCH_N 件の ID を取得し、各記事の詳細を JSON 配列として収集
stories=$(
  echo "$topstories" | jq -r ".[:${FETCH_N}][]" | \
  while IFS= read -r id; do
    sleep 1
    fetch_json "${BASE_URL}/item/${id}.json" | \
      jq --arg id "$id" '{
        title:       (.title       // "No title"),
        url:         (.url         // ("https://news.ycombinator.com/item?id=" + $id)),
        score:       (.score       // 0),
        descendants: (.descendants // 0)
      }'
  done | jq -s '.'
)

# スコア上位5件に絞り込み → コメント数フィルタ → スコア/コメント比を計算した共通データを用意
prepared=$(echo "$stories" | jq '
  sort_by(-.score)[:'"${TOP_N}"'] |
  map(select(.descendants >= '"${MIN_COMMENTS}"')) |
  map(. + {ratio: (if .descendants > 0 then (.score / .descendants * 10 | round / 10) else .score end)})
')

# フィルタ結果が 0 件の場合は警告して終了
if [[ $(echo "$prepared" | jq 'length') -eq 0 ]]; then
  echo "該当する記事が見つかりませんでした。--min-comments の値（${MIN_COMMENTS}）を下げてみてください。" >&2
  exit 1
fi

DATE=$(date '+%Y-%m-%d')

# --categorize 時は Claude でカテゴリを付与する
if $CATEGORIZE; then
  echo "Claude でカテゴリ分類中..." >&2
  titles_json=$(echo "$prepared" | jq '[to_entries[] | {index: .key, title: .value.title}]')

  categories_raw=$(claude -p "$(cat <<EOF
以下の Hacker News 記事タイトルを、次のカテゴリのいずれかに分類してください。
カテゴリ: AI/ML, Security, Systems, Web/Dev, Science, Business, Other

JSON 配列のみを返してください（説明・コードブロック不要）。
形式: [{"index": 0, "category": "..."}, ...]

${titles_json}
EOF
)")

  categories_raw=$(echo "$categories_raw" | sed 's/^```json[[:space:]]*//' | sed 's/^```[[:space:]]*//' | sed 's/[[:space:]]*```$//')

  if ! categories=$(echo "$categories_raw" | jq '.' 2>/dev/null); then
    echo "Error: Claude からのカテゴリ分類結果を JSON として解析できませんでした。" >&2
    echo "$categories_raw" >&2
    exit 1
  fi

  # カテゴリをマージした最終データ
  final=$(echo "$prepared" | jq \
    --argjson cats "$categories" '
    . as $stories |
    ($cats | map({(.index | tostring): .category}) | add) as $cat_map |
    [$stories | to_entries[] | .value + {category: ($cat_map[.key | tostring] // "Other")}]
  ')
else
  final=$(echo "$prepared" | jq 'sort_by(-.ratio) | to_entries[] | .value' | jq -s '.')
fi

# ── 出力 ──────────────────────────────────────────────

case "$FORMAT" in

  markdown)
    echo ""
    if $CATEGORIZE; then
      echo "## Hacker News (${DATE}) — カテゴリ別（Claude 分類）"
      echo "$final" | jq -r '
        group_by(.category)[] |
        "### \(.[0].category)\n" +
        "| Title | Score | Comments | Score/Comment |\n" +
        "|---|---|---|---|\n" +
        (map("| [\(.title)](\(.url)) | \(.score) | \(.descendants) | \(.ratio) |") | join("\n"))
      '
    else
      echo "## Hacker News (${DATE}) — Score/Comment 比 トップ ${TOP_N}"
      echo ""
      echo "| # | Title | Score | Comments | Score/Comment |"
      echo "|---|---|---|---|---|"
      echo "$final" | jq -r '
        to_entries[] |
        "| \(.key + 1) | [\(.value.title)](\(.value.url)) | \(.value.score) | \(.value.descendants) | \(.value.ratio) |"
      '
    fi
    ;;

  html)
    echo "<h2>Hacker News (${DATE})</h2>"
    if $CATEGORIZE; then
      echo "$final" | jq -r '
        group_by(.category)[] |
        "<h3>\(.[0].category)</h3>\n" +
        "<table>\n<thead><tr><th>Title</th><th>Score</th><th>Comments</th><th>Score/Comment</th></tr></thead>\n<tbody>\n" +
        (map("<tr><td><a href=\"\(.url)\">\(.title)</a></td><td>\(.score)</td><td>\(.descendants)</td><td>\(.ratio)</td></tr>") | join("\n")) +
        "\n</tbody>\n</table>"
      '
    else
      echo "<table>"
      echo "<thead><tr><th>#</th><th>Title</th><th>Score</th><th>Comments</th><th>Score/Comment</th></tr></thead>"
      echo "<tbody>"
      echo "$final" | jq -r '
        to_entries[] |
        "<tr><td>\(.key + 1)</td><td><a href=\"\(.value.url)\">\(.value.title)</a></td><td>\(.value.score)</td><td>\(.value.descendants)</td><td>\(.value.ratio)</td></tr>"
      '
      echo "</tbody>"
      echo "</table>"
    fi
    ;;

  json)
    if $CATEGORIZE; then
      echo "$final" | jq '[.[] | {title, url, score, comments: .descendants, ratio, category}]'
    else
      echo "$final" | jq '[to_entries[] | {rank: (.key + 1), title: .value.title, url: .value.url, score: .value.score, comments: .value.descendants, ratio: .value.ratio}]'
    fi
    ;;

esac
