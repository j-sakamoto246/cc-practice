#!/bin/bash
# Hacker News アダプタ
# API: https://hacker-news.firebaseio.com/v0

HN_BASE_URL="https://hacker-news.firebaseio.com/v0"

# 個別アイテム JSON の配列を統一形式に変換
# 入力: [{title, url, score, descendants}, ...] の JSON 配列
adapter_hn_transform() {
  local raw_json="$1"
  echo "$raw_json" | jq '[.[] | {
    title:    (.title       // "No title"),
    url:      (.url         // "https://news.ycombinator.com"),
    score:    (.score       // 0),
    comments: (.descendants // 0),
    source:   "hn"
  }]'
}

# API からデータ取得 → 変換
adapter_hn_fetch() {
  local fetch_n="${1:-$DEFAULT_FETCH_N}"
  local topstories raw_items

  echo "Fetching top ${fetch_n} stories from Hacker News..." >&2
  topstories=$(fetch_json "${HN_BASE_URL}/topstories.json") || return 1

  raw_items=$(
    echo "$topstories" | jq -r ".[:${fetch_n}][]" | \
    while IFS= read -r id; do
      sleep 1
      fetch_json "${HN_BASE_URL}/item/${id}.json" | \
        jq '{title, url, score, descendants}'
    done | jq -s '.'
  )

  adapter_hn_transform "$raw_items"
}
