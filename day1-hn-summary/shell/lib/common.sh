#!/bin/bash
# 共通ユーティリティ: fetch_json, normalize_scores, merge_and_rank

MAX_RETRY=3
# shellcheck disable=SC2034  # アダプタから参照される
DEFAULT_FETCH_N=30
DEFAULT_TOP_N=10

# リトライ付き curl 関数
# 使い方: fetch_json <url> [extra_curl_flags...]
# HTTP レスポンスが空または不正な JSON の場合は最大 MAX_RETRY 回リトライ
fetch_json() {
  local url="$1"
  shift
  local extra_flags=("$@")
  local attempt=1
  local result

  while [[ $attempt -le $MAX_RETRY ]]; do
    result=$(curl -sf "${extra_flags[@]+"${extra_flags[@]}"}" "$url" 2>/dev/null || true)
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

# スコアの min-max 正規化（0-100）
# stdin から JSON 配列を受け取り、normalized_score を付与して出力
normalize_scores() {
  jq '
    if length == 0 then []
    else
      (map(.score) | min) as $min |
      (map(.score) | max) as $max |
      if $max == $min then
        map(. + {normalized_score: 50})
      else
        map(. + {normalized_score: ((.score - $min) / ($max - $min) * 100 | round)})
      end
    end
  '
}

# 統合ランキング: normalized_score 降順でソートし上位 N 件に絞り込み
# 使い方: echo "$json_array" | merge_and_rank <top_n>
merge_and_rank() {
  local top_n="${1:-$DEFAULT_TOP_N}"
  jq "sort_by(-.normalized_score) | .[:${top_n}]"
}
