#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  echo "$haystack" | grep -q "$needle" && pass "$desc" || fail "$desc（'${needle}' が見つからない）"
}

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  [[ "$expected" == "$actual" ]] && pass "$desc" || fail "$desc（期待: ${expected}, 実際: ${actual}）"
}

# ─────────────────────────────────────────────
echo "=== hn-top10.sh: --help ==="

help_out=$("${SCRIPT_DIR}/hn-top10.sh" --help 2>&1)
assert_contains "--help に Usage が含まれる"  "Usage:"   "$help_out"
assert_contains "--help に FETCH_N が含まれる" "FETCH_N"  "$help_out"
assert_contains "--help に TOP_N が含まれる"   "TOP_N"    "$help_out"
assert_contains "--help に依存コマンドが含まれる" "curl"  "$help_out"

# --help で終了コード 0
"${SCRIPT_DIR}/hn-top10.sh" --help > /dev/null 2>&1 \
  && pass "--help の終了コードが 0" || fail "--help の終了コードが 0"

# ─────────────────────────────────────────────
echo ""
echo "=== hn-top10.sh: 出力フォーマット（API アクセスあり・約30秒）==="

output=$("${SCRIPT_DIR}/hn-top10.sh" 2>/dev/null)

# Markdown テーブルヘッダー
assert_contains "テーブルヘッダーが正しい" \
  "| # | Title | Score | Comments | Score/Comment |" "$output"

# 今日の日付が含まれる
assert_contains "日付ヘッダーに今日の日付が含まれる" "$(date '+%Y-%m-%d')" "$output"

# データ行が 5 件
data_rows=$(echo "$output" | grep -c "^| [0-9]" || true)
assert_eq "データ行が 5 件" "5" "$data_rows"

# 各データ行のカラム数が 6（パイプ文字が 6 個）
invalid_rows=0
while IFS= read -r line; do
  if [[ "$line" =~ ^\|\ [0-9] ]]; then
    cols=$(echo "$line" | tr -cd '|' | wc -c)
    [[ "$cols" -ne 6 ]] && invalid_rows=$((invalid_rows + 1))
  fi
done <<< "$output"
[[ "$invalid_rows" -eq 0 ]] \
  && pass "全データ行のカラム数が正しい（6列）" \
  || fail "カラム数が不正な行が ${invalid_rows} 件"

# Score/Comment 比がすべて数値
invalid_ratios=0
while IFS= read -r ratio; do
  echo "$ratio" | grep -qE '^[0-9]+(\.[0-9]+)?$' || invalid_ratios=$((invalid_ratios + 1))
done <<< "$(echo "$output" | grep "^| [0-9]" | awk -F'|' '{print $6}' | tr -d ' ')"
[[ "$invalid_ratios" -eq 0 ]] \
  && pass "Score/Comment 比がすべて数値" \
  || fail "Score/Comment 比に非数値が ${invalid_ratios} 件"

# Score が降順（ratio ではなく score でソートされた上位5件の中で ratio ソート済み）
scores=$(echo "$output" | grep "^| [0-9]" | awk -F'|' '{print $4}' | tr -d ' ')
max_score=999999
valid_order=true
while IFS= read -r score; do
  [[ "$score" -le "$max_score" ]] 2>/dev/null || valid_order=false
  max_score=$score
done <<< "$scores"
# Score は ratio ソート後なので完全降順でなくてもよい — 全件が正の整数かを確認
all_positive=true
while IFS= read -r score; do
  echo "$score" | grep -qE '^[0-9]+$' || all_positive=false
done <<< "$scores"
$all_positive && pass "Score がすべて正の整数" || fail "Score がすべて正の整数"

# ─────────────────────────────────────────────
echo ""
echo "=== hn-summary.sh: --help ==="

help_out=$("${SCRIPT_DIR}/hn-summary.sh" --help 2>&1)
assert_contains "--help に Usage が含まれる"          "Usage:"  "$help_out"
assert_contains "--help に claude への依存が明記される" "claude" "$help_out"

"${SCRIPT_DIR}/hn-summary.sh" --help > /dev/null 2>&1 \
  && pass "--help の終了コードが 0" || fail "--help の終了コードが 0"

# ─────────────────────────────────────────────
echo ""
echo "================================"
echo "結果: ${PASS} passed, ${FAIL} failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
