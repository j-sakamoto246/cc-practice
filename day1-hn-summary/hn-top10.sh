#!/bin/bash

set -euo pipefail

BASE_URL="https://hacker-news.firebaseio.com/v0"
FETCH_N=30   # スコア上位5件を確実に捕捉するため多めに取得
TOP_N=5

echo "Fetching top ${FETCH_N} stories from Hacker News..." >&2

# 上位 FETCH_N 件の ID を取得し、各記事の詳細を JSON 配列として収集
stories=$(
  curl -s "${BASE_URL}/topstories.json" | jq -r ".[:${FETCH_N}][]" | \
  while IFS= read -r id; do
    curl -s "${BASE_URL}/item/${id}.json" | \
      jq --arg id "$id" '{
        title:       (.title       // "No title"),
        url:         (.url         // ("https://news.ycombinator.com/item?id=" + $id)),
        score:       (.score       // 0),
        descendants: (.descendants // 0)
      }'
  done | jq -s '.'
)

# スコア上位5件に絞り込み → スコア/コメント比で降順ソート → Markdown テーブル出力
echo ""
echo "## Hacker News ($(date '+%Y-%m-%d')) — Score/Comment 比 トップ ${TOP_N}"
echo ""
echo "| # | Title | Score | Comments | Score/Comment |"
echo "|---|---|---|---|---|"

echo "$stories" | jq -r '
  sort_by(-.score)[:'"${TOP_N}"'] |
  map(. + {ratio: (if .descendants > 0 then (.score / .descendants * 10 | round / 10) else .score end)}) |
  sort_by(-.ratio) |
  to_entries[] |
  "| \(.key + 1) | [\(.value.title)](\(.value.url)) | \(.value.score) | \(.value.descendants) | \(.value.ratio) |"
'
