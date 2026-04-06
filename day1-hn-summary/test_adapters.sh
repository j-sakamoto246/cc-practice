#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF -- "$needle"; then
    pass "$desc"
  else
    fail "$desc（'${needle}' が見つからない）"
  fi
}

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    pass "$desc"
  else
    fail "$desc（期待: ${expected}, 実際: ${actual}）"
  fi
}

# 共通: アダプタ出力の統一形式を検証するヘルパー
# 引数: $1=テスト名プレフィクス, $2=JSON出力, $3=期待source名, $4=期待件数
assert_adapter_output() {
  local prefix="$1" output="$2" expected_source="$3" expected_count="$4"

  # 要素数
  local count
  count=$(echo "$output" | jq 'length')
  assert_eq "${prefix}: 要素数が ${expected_count}" "$expected_count" "$count"

  # 必須キーの存在確認
  local missing_keys
  missing_keys=$(echo "$output" | jq '[.[] | select(
    (.title | type) != "string" or
    (.url | type) != "string" or
    (.score | type) != "number" or
    (.comments | type) != "number" or
    (.source | type) != "string"
  )] | length')
  assert_eq "${prefix}: 全要素に必須キー(title,url,score,comments,source)が存在" "0" "$missing_keys"

  # source フィールドの値
  local wrong_source
  wrong_source=$(echo "$output" | jq --arg src "$expected_source" '[.[] | select(.source != $src)] | length')
  assert_eq "${prefix}: source が全て '${expected_source}'" "0" "$wrong_source"
}

# 共通ライブラリを読み込み
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

# ─────────────────────────────────────────────
echo "=== adapter_lobsters: transform テスト ==="

# shellcheck source=lib/adapter_lobsters.sh
source "${SCRIPT_DIR}/lib/adapter_lobsters.sh"

lobsters_out=$(adapter_lobsters_transform "$(cat "${SCRIPT_DIR}/testdata/mock_lobsters.json")")
assert_adapter_output "lobsters" "$lobsters_out" "lobsters" "3"

# URL フォールバック: url が空の場合は short_id_url を使用
lobsters_fallback_url=$(echo "$lobsters_out" | jq -r '.[2].url')
assert_eq "lobsters: 空URL は short_id_url にフォールバック" "https://lobste.rs/s/ghi" "$lobsters_fallback_url"

# ─────────────────────────────────────────────
echo ""
echo "=== adapter_devto: transform テスト ==="

# shellcheck source=lib/adapter_devto.sh
source "${SCRIPT_DIR}/lib/adapter_devto.sh"

devto_out=$(adapter_devto_transform "$(cat "${SCRIPT_DIR}/testdata/mock_devto.json")")
assert_adapter_output "devto" "$devto_out" "devto" "3"

# positive_reactions_count が score にマッピングされているか
devto_score=$(echo "$devto_out" | jq '.[0].score')
assert_eq "devto: positive_reactions_count → score マッピング" "500" "$devto_score"

# ─────────────────────────────────────────────
echo ""
echo "=== adapter_reddit: transform テスト ==="

# shellcheck source=lib/adapter_reddit.sh
source "${SCRIPT_DIR}/lib/adapter_reddit.sh"

reddit_out=$(adapter_reddit_transform "$(cat "${SCRIPT_DIR}/testdata/mock_reddit.json")")
assert_adapter_output "reddit" "$reddit_out" "reddit" "3"

# num_comments が comments にマッピングされているか
reddit_comments=$(echo "$reddit_out" | jq '.[0].comments')
assert_eq "reddit: num_comments → comments マッピング" "300" "$reddit_comments"

# ─────────────────────────────────────────────
echo ""
echo "=== adapter_hn: transform テスト ==="

# shellcheck source=lib/adapter_hn.sh
source "${SCRIPT_DIR}/lib/adapter_hn.sh"

hn_out=$(adapter_hn_transform "$(cat "${SCRIPT_DIR}/testdata/mock_hn_items.json")")
assert_adapter_output "hn" "$hn_out" "hn" "3"

# descendants が comments にマッピングされているか
hn_comments=$(echo "$hn_out" | jq '.[1].comments')
assert_eq "hn: descendants → comments マッピング" "80" "$hn_comments"

# url が null の場合のフォールバック
hn_null_url=$(echo "$hn_out" | jq -r '.[2].url')
assert_eq "hn: null URL のフォールバック" "https://news.ycombinator.com" "$hn_null_url"

# ─────────────────────────────────────────────
echo ""
echo "=== normalize_scores テスト ==="

# 通常ケース: [10, 50, 100] → [0, 50, 100]
norm_out=$(echo '[{"score":10,"title":"a","url":"u","comments":0,"source":"test"},{"score":50,"title":"b","url":"u","comments":0,"source":"test"},{"score":100,"title":"c","url":"u","comments":0,"source":"test"}]' | normalize_scores)
norm_min=$(echo "$norm_out" | jq '.[0].normalized_score')
norm_mid=$(echo "$norm_out" | jq '.[1].normalized_score')
norm_max=$(echo "$norm_out" | jq '.[2].normalized_score')
assert_eq "normalize: 最小スコア → 0" "0" "$norm_min"
assert_eq "normalize: 中間スコア → 44 (round)" "44" "$norm_mid"
assert_eq "normalize: 最大スコア → 100" "100" "$norm_max"

# 全スコア同一 → 50
norm_equal=$(echo '[{"score":42,"title":"a","url":"u","comments":0,"source":"test"},{"score":42,"title":"b","url":"u","comments":0,"source":"test"}]' | normalize_scores)
norm_eq_val=$(echo "$norm_equal" | jq '.[0].normalized_score')
assert_eq "normalize: 全スコア同一 → 50" "50" "$norm_eq_val"

# 単一要素 → 50
norm_single=$(echo '[{"score":99,"title":"a","url":"u","comments":0,"source":"test"}]' | normalize_scores)
norm_single_val=$(echo "$norm_single" | jq '.[0].normalized_score')
assert_eq "normalize: 単一要素 → 50" "50" "$norm_single_val"

# 空配列
norm_empty=$(echo '[]' | normalize_scores)
norm_empty_len=$(echo "$norm_empty" | jq 'length')
assert_eq "normalize: 空配列 → 空配列" "0" "$norm_empty_len"

# ─────────────────────────────────────────────
echo ""
echo "=== news-summary.sh: --help テスト ==="

help_out=$("${SCRIPT_DIR}/news-summary.sh" --help 2>&1)
assert_contains "--help に Usage が含まれる"    "Usage:"    "$help_out"
assert_contains "--help に --sources が含まれる" "--sources" "$help_out"

if "${SCRIPT_DIR}/news-summary.sh" --help > /dev/null 2>&1; then
  pass "--help の終了コードが 0"
else
  fail "--help の終了コードが 0"
fi

# ─────────────────────────────────────────────
echo ""
echo "================================"
echo "結果: ${PASS} passed, ${FAIL} failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
