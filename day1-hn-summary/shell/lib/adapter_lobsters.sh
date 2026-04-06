#!/bin/bash
# Lobsters アダプタ
# API: https://lobste.rs/hottest.json

LOBSTERS_BASE_URL="https://lobste.rs"

# 生 API レスポンスを統一形式に変換
adapter_lobsters_transform() {
  local raw_json="$1"
  echo "$raw_json" | jq '[.[] | {
    title: .title,
    url:   (if (.url // "") == "" then .short_id_url else .url end),
    score: .score,
    comments: .comment_count,
    source: "lobsters"
  }]'
}

# API からデータ取得 → 変換
adapter_lobsters_fetch() {
  local fetch_n="${1:-$DEFAULT_FETCH_N}"
  local raw
  raw=$(fetch_json "${LOBSTERS_BASE_URL}/hottest.json") || return 1
  echo "$raw" | jq ".[:${fetch_n}]" | adapter_lobsters_transform "$(cat)"
}
