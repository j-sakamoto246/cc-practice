#!/bin/bash
# Dev.to アダプタ
# API: https://dev.to/api/articles?top=7&per_page=30

DEVTO_BASE_URL="https://dev.to/api"

# 生 API レスポンスを統一形式に変換
adapter_devto_transform() {
  local raw_json="$1"
  echo "$raw_json" | jq '[.[] | {
    title: .title,
    url:   .url,
    score: .positive_reactions_count,
    comments: .comments_count,
    source: "devto"
  }]'
}

# API からデータ取得 → 変換
adapter_devto_fetch() {
  local fetch_n="${1:-$DEFAULT_FETCH_N}"
  local raw
  raw=$(fetch_json "${DEVTO_BASE_URL}/articles?top=7&per_page=${fetch_n}") || return 1
  adapter_devto_transform "$raw"
}
