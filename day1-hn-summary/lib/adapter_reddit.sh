#!/bin/bash
# Reddit アダプタ
# API: https://www.reddit.com/r/programming/top.json?limit=30

REDDIT_BASE_URL="https://www.reddit.com"
REDDIT_USER_AGENT="news-aggregator/1.0"

# 生 API レスポンスを統一形式に変換
adapter_reddit_transform() {
  local raw_json="$1"
  echo "$raw_json" | jq '[.data.children[] | .data | {
    title: .title,
    url:   .url,
    score: .score,
    comments: .num_comments,
    source: "reddit"
  }]'
}

# API からデータ取得 → 変換
adapter_reddit_fetch() {
  local fetch_n="${1:-$DEFAULT_FETCH_N}"
  local raw
  raw=$(fetch_json "${REDDIT_BASE_URL}/r/programming/top.json?limit=${fetch_n}" \
    -H "User-Agent: ${REDDIT_USER_AGENT}") || return 1
  adapter_reddit_transform "$raw"
}
