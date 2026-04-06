#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
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

# ─────────────────────────────────────────────
echo "=== hn-top10.sh: --help ==="

help_out=$("${SCRIPT_DIR}/hn-top10.sh" --help 2>&1)
assert_contains "--help に Usage が含まれる"  "Usage:"   "$help_out"
assert_contains "--help に FETCH_N が含まれる" "FETCH_N"  "$help_out"
assert_contains "--help に TOP_N が含まれる"   "TOP_N"    "$help_out"
assert_contains "--help に依存コマンドが含まれる" "curl"  "$help_out"

# --help で終了コード 0
if "${SCRIPT_DIR}/hn-top10.sh" --help > /dev/null 2>&1; then
  pass "--help の終了コードが 0"
else
  fail "--help の終了コードが 0"
fi

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
if [[ "$invalid_rows" -eq 0 ]]; then
  pass "全データ行のカラム数が正しい（6列）"
else
  fail "カラム数が不正な行が ${invalid_rows} 件"
fi

# Score/Comment 比がすべて数値
invalid_ratios=0
while IFS= read -r ratio; do
  if ! echo "$ratio" | grep -qE '^[0-9]+(\.[0-9]+)?$'; then
    invalid_ratios=$((invalid_ratios + 1))
  fi
done <<< "$(echo "$output" | grep "^| [0-9]" | awk -F'|' '{print $6}' | tr -d ' ')"
if [[ "$invalid_ratios" -eq 0 ]]; then
  pass "Score/Comment 比がすべて数値"
else
  fail "Score/Comment 比に非数値が ${invalid_ratios} 件"
fi

# Score がすべて正の整数かを確認
scores=$(echo "$output" | grep "^| [0-9]" | awk -F'|' '{print $4}' | tr -d ' ')
all_positive=true
while IFS= read -r score; do
  if ! echo "$score" | grep -qE '^[0-9]+$'; then
    all_positive=false
  fi
done <<< "$scores"
if $all_positive; then
  pass "Score がすべて正の整数"
else
  fail "Score がすべて正の整数"
fi

# ─────────────────────────────────────────────
echo ""
echo "=== hn-summary.sh: --help ==="

help_out=$("${SCRIPT_DIR}/hn-summary.sh" --help 2>&1)
assert_contains "--help に Usage が含まれる"          "Usage:"  "$help_out"
assert_contains "--help に claude への依存が明記される" "claude" "$help_out"

if "${SCRIPT_DIR}/hn-summary.sh" --help > /dev/null 2>&1; then
  pass "--help の終了コードが 0"
else
  fail "--help の終了コードが 0"
fi

# ─────────────────────────────────────────────
echo ""
echo "================================"
echo "結果: ${PASS} passed, ${FAIL} failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
