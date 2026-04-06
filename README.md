# Claude Code 研修ワークスペース

## day1-hn-summary

Hacker News / Reddit / Lobsters / Dev.to からニュースを集約するスクリプト群。

### セットアップ

```bash
cd day1-hn-summary

# 依存コマンドの確認
curl --version && jq --version
```

### コマンド集

```bash
# HN トップ記事をMarkdownテーブルで表示
./hn-top10.sh

# フォーマット指定（markdown / html / json）
./hn-top10.sh --format json

# コメント数フィルタ（コメント10件以上のみ）
./hn-top10.sh --min-comments 10

# Claude でカテゴリ分類して表示（claude CLI 必須）
./hn-top10.sh --categorize

# HN記事 + Claudeによる日本語サマリー生成（claude CLI 必須）
./hn-summary.sh

# 複数ソースの統合ランキング（デフォルト: HNのみ）
./news-summary.sh

# ソースを指定（hn / reddit / lobsters / devto）
./news-summary.sh --sources "hn,reddit,lobsters"

# 全ソース統合、上位15件をJSON出力
./news-summary.sh --sources "hn,reddit,lobsters,devto" --top 15 --format json

# 全ソース統合ランキング + Claudeによる日本語サマリー生成（よく使う）
./news-summary.sh --sources "hn,reddit,lobsters,devto" | \
  claude -p "以下のニュース一覧の各記事を1〜2文の日本語でサマリーしてください。Markdownの箇条書き形式で出力してください。"
```

### テスト

```bash
# アダプタテスト（モックデータ使用、API アクセスなし・高速）
bash test_adapters.sh

# 統合テスト（HN API アクセスあり・約30秒）
bash test_scripts.sh
```

### 依存コマンド

| コマンド | 用途 | 必須スクリプト |
|---|---|---|
| `curl` | API リクエスト | 全スクリプト |
| `jq` | JSON パース | 全スクリプト |
| `claude` | 日本語サマリー・カテゴリ分類 | `hn-summary.sh`, `hn-top10.sh --categorize` |

