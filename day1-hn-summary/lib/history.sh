#!/usr/bin/env bash
# lib/history.sh — SQLite 履歴管理ライブラリ
# このファイルは source で読み込んで使用します。直接実行しないでください。
#
# 環境変数:
#   HN_HISTORY_DB — DB ファイルパスの上書き（テスト用）

HN_HISTORY_DB="${HN_HISTORY_DB:-${HOME}/.local/share/hn-summary/history.db}"

# ---------------------------------------------------------------------------
# 内部ヘルパー
# ---------------------------------------------------------------------------

_history_db_exec() {
  sqlite3 "$HN_HISTORY_DB" "$@"
}

# ---------------------------------------------------------------------------
# history_init
# DB ファイルとスキーマを作成（未作成の場合）。自動クリーンアップも実行。
# ---------------------------------------------------------------------------
history_init() {
  if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "Warning: sqlite3 が見つかりません。履歴機能は無効です。" >&2
    echo "  インストール: sudo apt-get install sqlite3  (Ubuntu/Debian)" >&2
    echo "               brew install sqlite3           (macOS)" >&2
    # 以降の history_* 呼び出しを全て no-op にする
    # shellcheck disable=SC2317
    history_save_run()  { :; }
    # shellcheck disable=SC2317
    history_diff()      { echo ""; echo "---"; echo ""; echo "## Diff: sqlite3 が見つかりません。履歴機能は無効です。"; echo ""; echo "---"; }
    # shellcheck disable=SC2317
    history_trend()     { echo ""; echo "---"; echo ""; echo "## Trend: sqlite3 が見つかりません。履歴機能は無効です。"; echo ""; echo "---"; }
    # shellcheck disable=SC2317
    history_cleanup()   { :; }
    return 0
  fi

  mkdir -p "$(dirname "$HN_HISTORY_DB")"

  # WAL モードを有効化（pragma の戻り値を抑制）
  sqlite3 "$HN_HISTORY_DB" "PRAGMA journal_mode=WAL;" > /dev/null

  _history_db_exec "
    CREATE TABLE IF NOT EXISTS runs (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at  TEXT NOT NULL,
      script  TEXT NOT NULL,
      sources TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS articles (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      url    TEXT NOT NULL UNIQUE,
      title  TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'hn'
    );

    CREATE TABLE IF NOT EXISTS run_articles (
      run_id           INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      article_id       INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      rank             INTEGER NOT NULL,
      score            INTEGER NOT NULL DEFAULT 0,
      comments         INTEGER NOT NULL DEFAULT 0,
      ratio            REAL,
      category         TEXT,
      normalized_score REAL,
      PRIMARY KEY (run_id, article_id)
    );

    CREATE INDEX IF NOT EXISTS idx_runs_run_at ON runs(run_at);
  "

  # shellcheck disable=SC2119
  history_cleanup
}

# ---------------------------------------------------------------------------
# history_save_run <script> <sources> <json_array>
#
# <script>     : 'hn-top10' または 'news-summary'
# <sources>    : 'hn' または 'hn,reddit' 等
# <json_array> : ランク付き JSON 配列
#   hn-top10 形式:      {title, url, score, descendants, ratio, category?}
#   news-summary 形式:  {title, url, score, comments, source, normalized_score}
# ---------------------------------------------------------------------------
history_save_run() {
  local script="$1"
  local sources="$2"
  local json_array="$3"

  local run_at
  run_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

  # runs テーブルに挿入し run_id を取得
  local run_id
  run_id=$(_history_db_exec \
    "INSERT INTO runs (run_at, script, sources) VALUES ('${run_at}', '${script}', '${sources}'); SELECT last_insert_rowid();")

  # 各記事を処理
  local length
  length=$(echo "$json_array" | jq 'length')
  local i=0
  while [[ $i -lt $length ]]; do
    local item
    item=$(echo "$json_array" | jq ".[$i]")

    local title url score comments ratio category normalized_score source_name
    title=$(echo "$item"         | jq -r '.title // "No title"')
    url=$(echo "$item"           | jq -r '.url // ""')
    score=$(echo "$item"         | jq -r '.score // 0')
    # hn-top10 は descendants、news-summary は comments
    comments=$(echo "$item"      | jq -r 'if .comments != null then .comments elif .descendants != null then .descendants else 0 end')
    ratio=$(echo "$item"         | jq -r '.ratio // "NULL"')
    category=$(echo "$item"      | jq -r '.category // "NULL"')
    normalized_score=$(echo "$item" | jq -r '.normalized_score // "NULL"')
    source_name=$(echo "$item"   | jq -r '.source // "hn"')
    local rank=$((i + 1))

    # SQL インジェクション対策：シングルクォートをエスケープ
    local safe_title safe_url safe_source
    safe_title="${title//\'/\'\'}"
    safe_url="${url//\'/\'\'}"
    safe_source="${source_name//\'/\'\'}"

    # articles テーブルに upsert（URL が一意キー）
    local article_id
    article_id=$(_history_db_exec \
      "INSERT INTO articles (url, title, source) VALUES ('${safe_url}', '${safe_title}', '${safe_source}')
       ON CONFLICT(url) DO UPDATE SET title = excluded.title, source = excluded.source;
       SELECT id FROM articles WHERE url = '${safe_url}';")

    # ratio/category/normalized_score の NULL 処理
    local ratio_sql category_sql norm_sql
    if [[ "$ratio" == "NULL" ]]; then ratio_sql="NULL"; else ratio_sql="$ratio"; fi
    if [[ "$category" == "NULL" ]]; then category_sql="NULL"; else category_sql="'${category//\'/\'\'}'"; fi
    if [[ "$normalized_score" == "NULL" ]]; then norm_sql="NULL"; else norm_sql="$normalized_score"; fi

    _history_db_exec \
      "INSERT OR IGNORE INTO run_articles
         (run_id, article_id, rank, score, comments, ratio, category, normalized_score)
       VALUES
         (${run_id}, ${article_id}, ${rank}, ${score}, ${comments}, ${ratio_sql}, ${category_sql}, ${norm_sql});"

    i=$((i + 1))
  done
}

# ---------------------------------------------------------------------------
# history_diff <script> <sources> <current_json>
# 前回の実行との差分を Markdown で stdout に出力
# ---------------------------------------------------------------------------
history_diff() {
  local script="$1"
  local sources="$2"
  local current_json="$3"

  local safe_script="${script//\'/\'\'}"
  local safe_sources="${sources//\'/\'\'}"

  # 直近の実行（現在実行中は除く最後の run）を取得
  local prev_run_id prev_run_at
  prev_run_id=$(_history_db_exec \
    "SELECT id FROM runs WHERE script='${safe_script}' AND sources='${safe_sources}'
     ORDER BY run_at DESC, id DESC LIMIT 1;")

  if [[ -z "$prev_run_id" ]]; then
    echo ""
    echo "---"
    echo ""
    echo "## Diff: 前回の実行記録が見つかりませんでした。"
    echo ""
    echo "---"
    return 0
  fi

  prev_run_at=$(_history_db_exec \
    "SELECT date(run_at) FROM runs WHERE id=${prev_run_id};")

  # 前回の記事 URL セット
  local prev_urls
  prev_urls=$(_history_db_exec \
    "SELECT a.url FROM run_articles ra JOIN articles a ON a.id = ra.article_id
     WHERE ra.run_id=${prev_run_id};")

  # 新着 = 現在にあって前回にない
  local new_articles
  new_articles=$(echo "$current_json" | jq -r \
    --argjson prev "$(echo "$prev_urls" | jq -R '[.]' | jq -s 'add // []')" \
    '[.[] | select(.url as $u | ($prev | index($u)) == null)]')

  # 消滅 = 前回にあって現在にない（articles テーブルから情報取得、-json フラグで JSON 出力）
  local gone_articles
  gone_articles=$(sqlite3 -json "$HN_HISTORY_DB" \
    "SELECT a.title, a.url, ra.score, ra.comments
     FROM run_articles ra JOIN articles a ON a.id = ra.article_id
     WHERE ra.run_id=${prev_run_id};" 2>/dev/null)
  [[ -z "$gone_articles" ]] && gone_articles="[]"

  # jq で前回 URL のうち現在にないものを抽出
  local current_urls_json
  current_urls_json=$(echo "$current_json" | jq '[.[].url]')

  echo ""
  echo "---"
  echo ""

  local new_count
  new_count=$(echo "$new_articles" | jq 'length')
  # gone_count はフィルタ後（現在にない記事のみ）で計算する
  local gone_count
  gone_count=$(echo "$gone_articles" | jq \
    --argjson cur "$current_urls_json" \
    '[.[] | select(.url as $u | ($cur | index($u)) == null)] | length' 2>/dev/null || echo 0)

  if [[ "$new_count" -eq 0 && "$gone_count" -eq 0 ]]; then
    echo "## Diff from last run (${prev_run_at}): 変化なし。"
    echo ""
    echo "---"
    return 0
  fi

  echo "## Diff from last run (${prev_run_at})"
  echo ""

  if [[ "$new_count" -gt 0 ]]; then
    echo "### 新着記事（前回から追加）"
    echo "| Title | Score | Comments |"
    echo "|---|---|---|"
    echo "$new_articles" | jq -r \
      '.[] | "| [\(.title)](\(.url)) | \(.score) | \(if .comments != null then .comments elif .descendants != null then .descendants else 0 end) |"'
    echo ""
  fi

  if [[ "$gone_count" -gt 0 ]]; then
    echo "### 消滅記事（前回から消えた）"
    echo "| Title | Score | Comments |"
    echo "|---|---|---|"
    echo "$gone_articles" | jq -r \
      --argjson cur "$current_urls_json" \
      '[.[] | select(.url as $u | ($cur | index($u)) == null)] |
       .[] | "| [\(.title)](\(.url)) | \(.score) | \(.comments) |"' 2>/dev/null || true
    echo ""
  fi

  echo "---"
}

# ---------------------------------------------------------------------------
# history_trend <script> <sources>
# 過去 7 日間のトレンドを Markdown で stdout に出力
# ---------------------------------------------------------------------------
history_trend() {
  local script="$1"
  local sources="$2"

  local safe_script="${script//\'/\'\'}"
  local safe_sources="${sources//\'/\'\'}"

  echo ""
  echo "---"
  echo ""
  echo "## Trend Analysis（過去 7 日間）"
  echo ""

  if [[ "$script" == "hn-top10" ]]; then
    # カテゴリ別集計
    local rows
    rows=$(sqlite3 -separator '|' "$HN_HISTORY_DB" \
      "SELECT COALESCE(ra.category, '(no category)') as category,
              COUNT(*) as appearances,
              ROUND(AVG(ra.score), 1) as avg_score,
              ROUND(AVG(ra.ratio), 1) as avg_ratio
       FROM run_articles ra
       JOIN runs r ON r.id = ra.run_id
       WHERE r.script='${safe_script}' AND r.sources='${safe_sources}'
         AND r.run_at >= datetime('now', '-7 days')
       GROUP BY category
       ORDER BY appearances DESC, avg_score DESC;")

    echo "| Category | 登場回数 | 平均 Score | 平均 Score/Comment |"
    echo "|---|---|---|---|"
    if [[ -n "$rows" ]]; then
      while IFS='|' read -r cat appearances avg_score avg_ratio; do
        echo "| ${cat} | ${appearances} | ${avg_score} | ${avg_ratio} |"
      done <<< "$rows"
    else
      echo "| (データなし) | - | - | - |"
    fi
  else
    # ソース別集計（news-summary）
    local rows
    rows=$(sqlite3 -separator '|' "$HN_HISTORY_DB" \
      "SELECT a.source,
              COUNT(*) as appearances,
              ROUND(AVG(ra.normalized_score), 1) as avg_norm,
              ROUND(AVG(ra.comments), 1) as avg_comments
       FROM run_articles ra
       JOIN articles a ON a.id = ra.article_id
       JOIN runs r ON r.id = ra.run_id
       WHERE r.script='${safe_script}' AND r.sources='${safe_sources}'
         AND r.run_at >= datetime('now', '-7 days')
       GROUP BY a.source
       ORDER BY appearances DESC, avg_norm DESC;")

    echo "| Source | 登場回数 | 平均 Normalized Score | 平均 Comments |"
    echo "|---|---|---|---|"
    if [[ -n "$rows" ]]; then
      while IFS='|' read -r src appearances avg_norm avg_comments; do
        echo "| ${src} | ${appearances} | ${avg_norm} | ${avg_comments} |"
      done <<< "$rows"
    else
      echo "| (データなし) | - | - | - |"
    fi
  fi

  echo ""
  echo "---"
}

# ---------------------------------------------------------------------------
# history_cleanup [--days N]
# N 日超えの runs を削除（run_articles は CASCADE で連動削除）
# ---------------------------------------------------------------------------
# shellcheck disable=SC2120
history_cleanup() {
  local days=7
  if [[ "${1:-}" == "--days" && -n "${2:-}" ]]; then
    days="$2"
  fi

  # PRAGMA foreign_keys は接続ごとに設定が必要
  sqlite3 "$HN_HISTORY_DB" \
    "PRAGMA foreign_keys = ON; DELETE FROM runs WHERE run_at < datetime('now', '-${days} days');"
}
