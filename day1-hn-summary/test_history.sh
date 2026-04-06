#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

# テスト用の一時 DB を使用
export HN_HISTORY_DB
HN_HISTORY_DB=$(mktemp /tmp/hn_history_test_XXXXXX.db)
trap 'rm -f "$HN_HISTORY_DB"' EXIT

# shellcheck source=lib/history.sh
source "${SCRIPT_DIR}/lib/history.sh"

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# sqlite3 がない場合はスキップ
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "SKIP: sqlite3 が見つかりません。テストをスキップします。"
  echo "  インストール: sudo apt-get install sqlite3  (Ubuntu/Debian)"
  echo "               brew install sqlite3           (macOS)"
  exit 0
fi

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

assert_not_empty() {
  local desc="$1" value="$2"
  if [[ -n "$value" ]]; then
    pass "$desc"
  else
    fail "$desc（空文字列）"
  fi
}

# ---------------------------------------------------------------------------
# サンプルデータ
# ---------------------------------------------------------------------------

HN_SAMPLE='[
  {"title": "Article Alpha", "url": "https://example.com/a1", "score": 300, "descendants": 100, "ratio": 3.0},
  {"title": "Article Beta",  "url": "https://example.com/a2", "score": 200, "descendants": 50,  "ratio": 4.0},
  {"title": "Article Gamma", "url": "https://example.com/a3", "score": 100, "descendants": 0,   "ratio": 100.0}
]'

HN_SAMPLE_WITH_CATEGORY='[
  {"title": "AI Post",      "url": "https://example.com/ai1", "score": 400, "descendants": 80, "ratio": 5.0, "category": "AI/ML"},
  {"title": "Security Post","url": "https://example.com/sec1","score": 300, "descendants": 60, "ratio": 5.0, "category": "Security"},
  {"title": "Systems Post", "url": "https://example.com/sys1","score": 200, "descendants": 40, "ratio": 5.0, "category": "Systems"}
]'

NEWS_SAMPLE='[
  {"title": "HN Top",     "url": "https://example.com/hn1",  "score": 500, "comments": 150, "source": "hn",     "normalized_score": 100},
  {"title": "Reddit Top", "url": "https://example.com/red1", "score": 3000,"comments": 200, "source": "reddit", "normalized_score": 80},
  {"title": "HN Second",  "url": "https://example.com/hn2",  "score": 300, "comments": 90,  "source": "hn",     "normalized_score": 60}
]'

# ---------------------------------------------------------------------------
echo ""
echo "=== history_init: DB 作成 ==="
# ---------------------------------------------------------------------------

history_init

# テーブルが存在するか確認
tables=$(_history_db_exec ".tables")
assert_contains "runs テーブルが存在する"        "runs"        "$tables"
assert_contains "articles テーブルが存在する"    "articles"    "$tables"
assert_contains "run_articles テーブルが存在する" "run_articles" "$tables"

# 冪等性チェック
if history_init; then pass "history_init を 2 回呼んでもエラーにならない"; else fail "history_init の冪等性"; fi

# ---------------------------------------------------------------------------
echo ""
echo "=== history_save_run: hn-top10 ==="
# ---------------------------------------------------------------------------

history_save_run "hn-top10" "hn" "$HN_SAMPLE"

runs_count=$(_history_db_exec "SELECT COUNT(*) FROM runs;")
assert_eq "runs テーブルに 1 行挿入される" "1" "$runs_count"

articles_count=$(_history_db_exec "SELECT COUNT(*) FROM articles;")
assert_eq "articles テーブルに 3 行挿入される" "3" "$articles_count"

run_articles_count=$(_history_db_exec "SELECT COUNT(*) FROM run_articles;")
assert_eq "run_articles テーブルに 3 行挿入される" "3" "$run_articles_count"

saved_url=$(_history_db_exec "SELECT url FROM articles WHERE title='Article Alpha';")
assert_eq "URL が正しく保存される" "https://example.com/a1" "$saved_url"

saved_ratio=$(_history_db_exec "SELECT ratio FROM run_articles WHERE rank=1;")
assert_eq "ratio が正しく保存される" "3.0" "$saved_ratio"

saved_script=$(_history_db_exec "SELECT script FROM runs WHERE id=1;")
assert_eq "script='hn-top10' が保存される" "hn-top10" "$saved_script"

# ---------------------------------------------------------------------------
echo ""
echo "=== history_save_run: カテゴリ付き ==="
# ---------------------------------------------------------------------------

history_save_run "hn-top10" "hn" "$HN_SAMPLE_WITH_CATEGORY"

ai_cat=$(_history_db_exec "SELECT ra.category FROM run_articles ra JOIN articles a ON a.id=ra.article_id WHERE a.url='https://example.com/ai1' ORDER BY ra.run_id DESC LIMIT 1;")
assert_eq "カテゴリ 'AI/ML' が保存される" "AI/ML" "$ai_cat"

# ---------------------------------------------------------------------------
echo ""
echo "=== history_save_run: news-summary ==="
# ---------------------------------------------------------------------------

history_save_run "news-summary" "hn,reddit" "$NEWS_SAMPLE"

norm_score=$(_history_db_exec "SELECT ra.normalized_score FROM run_articles ra JOIN articles a ON a.id=ra.article_id WHERE a.url='https://example.com/hn1' ORDER BY ra.run_id DESC LIMIT 1;")
assert_eq "normalized_score が保存される" "100.0" "$norm_score"

ns_script=$(_history_db_exec "SELECT script FROM runs ORDER BY id DESC LIMIT 1;")
assert_eq "script='news-summary' が保存される" "news-summary" "$ns_script"

ns_sources=$(_history_db_exec "SELECT sources FROM runs ORDER BY id DESC LIMIT 1;")
assert_eq "sources='hn,reddit' が保存される" "hn,reddit" "$ns_sources"

# ---------------------------------------------------------------------------
echo ""
echo "=== history_diff: 前回なし ==="
# ---------------------------------------------------------------------------

# 一時 DB をリセット
rm -f "$HN_HISTORY_DB"
HN_HISTORY_DB=$(mktemp /tmp/hn_history_test_XXXXXX.db)
source "${SCRIPT_DIR}/lib/history.sh"
history_init

diff_output=$(history_diff "hn-top10" "hn" "$HN_SAMPLE" 2>&1)
assert_contains "前回なし時は案内メッセージを表示" "前回の実行記録が見つかりませんでした" "$diff_output"

# ---------------------------------------------------------------------------
echo ""
echo "=== history_diff: 新着・消滅 ==="
# ---------------------------------------------------------------------------

# 1回目保存
history_save_run "hn-top10" "hn" "$HN_SAMPLE"

# 2回目用データ（a1 を消して a4 を追加）
HN_SAMPLE2='[
  {"title": "Article Beta",  "url": "https://example.com/a2", "score": 250, "descendants": 60, "ratio": 4.2},
  {"title": "Article Gamma", "url": "https://example.com/a3", "score": 150, "descendants": 0,  "ratio": 150.0},
  {"title": "Article Delta", "url": "https://example.com/a4", "score": 180, "descendants": 30, "ratio": 6.0}
]'

diff_output=$(history_diff "hn-top10" "hn" "$HN_SAMPLE2" 2>&1)
assert_contains "新着記事セクションが表示される"     "新着記事" "$diff_output"
assert_contains "新着 Article Delta が表示される"   "Article Delta" "$diff_output"
assert_contains "消滅記事セクションが表示される"     "消滅記事" "$diff_output"
assert_contains "消滅 Article Alpha が表示される"   "Article Alpha" "$diff_output"

# ---------------------------------------------------------------------------
echo ""
echo "=== history_diff: 変化なし ==="
# ---------------------------------------------------------------------------

history_save_run "hn-top10" "hn" "$HN_SAMPLE2"
diff_output2=$(history_diff "hn-top10" "hn" "$HN_SAMPLE2" 2>&1)
assert_contains "変化なし時のメッセージ" "変化なし" "$diff_output2"

# ---------------------------------------------------------------------------
echo ""
echo "=== history_cleanup ==="
# ---------------------------------------------------------------------------

# 8日前のデータを手動挿入
_history_db_exec \
  "INSERT INTO runs (run_at, script, sources) VALUES (datetime('now', '-8 days'), 'hn-top10', 'hn');"
old_run_id=$(_history_db_exec "SELECT id FROM runs ORDER BY id DESC LIMIT 1;")
_history_db_exec \
  "INSERT INTO run_articles (run_id, article_id, rank, score, comments)
   SELECT ${old_run_id}, id, 1, 100, 10 FROM articles LIMIT 1;"

before_count=$(_history_db_exec "SELECT COUNT(*) FROM runs WHERE run_at < datetime('now', '-7 days');")
assert_eq "クリーンアップ前: 古い runs が 1 件ある" "1" "$before_count"

# shellcheck disable=SC2119
history_cleanup

after_count=$(_history_db_exec "SELECT COUNT(*) FROM runs WHERE run_at < datetime('now', '-7 days');")
assert_eq "クリーンアップ後: 古い runs が 0 件になる" "0" "$after_count"

recent_count=$(_history_db_exec "SELECT COUNT(*) FROM runs WHERE run_at >= datetime('now', '-7 days');")
# 現在の DB には最近の runs が残っているはず
if [[ "$recent_count" -gt 0 ]]; then
  pass "直近 7 日間の runs は保持される"
else
  fail "直近 7 日間の runs が削除された（保持されるべき）"
fi

ra_orphan=$(_history_db_exec "SELECT COUNT(*) FROM run_articles WHERE run_id=${old_run_id};")
assert_eq "CASCADE 削除で run_articles も削除される" "0" "$ra_orphan"

# ---------------------------------------------------------------------------
echo ""
echo "=== history_trend: hn-top10 ==="
# ---------------------------------------------------------------------------

# カテゴリ付きデータを保存
history_save_run "hn-top10" "hn" "$HN_SAMPLE_WITH_CATEGORY"

trend_output=$(history_trend "hn-top10" "hn" 2>&1)
assert_contains "hn-top10 トレンド: ヘッダー行がある"    "Trend Analysis"     "$trend_output"
assert_contains "hn-top10 トレンド: Category 列がある"   "Category"           "$trend_output"
assert_contains "hn-top10 トレンド: AI/ML が表示される"  "AI/ML"              "$trend_output"
assert_contains "hn-top10 トレンド: Security が表示される" "Security"          "$trend_output"

# ---------------------------------------------------------------------------
echo ""
echo "=== history_trend: news-summary ==="
# ---------------------------------------------------------------------------

history_save_run "news-summary" "hn,reddit" "$NEWS_SAMPLE"

trend_ns=$(history_trend "news-summary" "hn,reddit" 2>&1)
assert_contains "news-summary トレンド: ヘッダー行がある"  "Trend Analysis"   "$trend_ns"
assert_contains "news-summary トレンド: Source 列がある"   "Source"           "$trend_ns"
assert_contains "news-summary トレンド: hn が表示される"   "hn"               "$trend_ns"
assert_contains "news-summary トレンド: reddit が表示される" "reddit"          "$trend_ns"

# ---------------------------------------------------------------------------
echo ""
echo "=== 統合: --no-history オプション ==="
# ---------------------------------------------------------------------------

no_hist_output=$(bash "${SCRIPT_DIR}/hn-top10.sh" --help 2>&1)
assert_contains "--no-history がヘルプに記載される" "--no-history" "$no_hist_output"
assert_contains "--diff がヘルプに記載される"       "--diff"       "$no_hist_output"
assert_contains "--trend がヘルプに記載される"      "--trend"      "$no_hist_output"

no_hist_output_news=$(bash "${SCRIPT_DIR}/news-summary.sh" --help 2>&1)
assert_contains "news-summary --no-history がヘルプに記載される" "--no-history" "$no_hist_output_news"
assert_contains "news-summary --diff がヘルプに記載される"       "--diff"       "$no_hist_output_news"

# ---------------------------------------------------------------------------
echo ""
echo "============================="
echo "PASS: ${PASS}  FAIL: ${FAIL}"
echo "============================="

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
