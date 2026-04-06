# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

Hacker News のトップ記事を取得し、スコア/コメント比で並べ替えた Markdown レポートを生成する。
**Deno（TypeScript）版がメイン実装。** シェルスクリプト版は `shell/` にアーカイブ。

## 実行方法

```bash
# 記事データのみ取得・表示（Markdown テーブル）
deno task hn-top10

# 出力形式の指定
deno run --allow-net main.ts --format json
deno run --allow-net main.ts --format html
deno run --allow-net main.ts --min-comments 10

# 日本語サマリー生成（claude CLI が必要）
deno task summary

# ユニットテスト（ネットワーク不要）
deno task test
```

## 依存コマンド

- `deno` — fetch API 内蔵のため `curl`/`jq` 不要
- `claude` — Claude Code CLI（`summary.ts` のみ）

## アーキテクチャ

### ファイル構成

```
.
├── main.ts          # エントリポイント（hn-top10.sh 相当）
├── summary.ts       # エントリポイント（hn-summary.sh 相当）
├── hn_client.ts     # HN API fetch（リトライ・sleep 1 レートリミット付き）
├── ranking.ts       # 純粋関数: selectTopN, filterByMinComments, calculateRatio, rankStories
├── formatters.ts    # 出力レンダラー: Markdown / HTML / JSON
├── cli.ts           # CLI 引数パーサー（--format, --min-comments, --help）
├── schemas.ts       # Zod スキーマ（HN API レスポンス検証）
├── types.ts         # TypeScript インタフェース
├── deps.ts          # サードパーティ依存の集約 re-export
├── deno.json        # tasks / imports map
├── tests/           # deno test によるユニットテスト（41 テスト）
└── shell/           # アーカイブ: 旧シェルスクリプト版（curl + jq）
```

### データフロー

```
main.ts
  └─ cli.ts        — 引数パース
  └─ hn_client.ts  — HN API fetch（topstories → 各 item を逐次取得）
  └─ ranking.ts    — selectTopN → filterByMinComments → rankStories
  └─ formatters.ts — Markdown / HTML / JSON 出力
```

### HN API エンドポイント（ベース URL: `https://hacker-news.firebaseio.com/v0`）

| エンドポイント | 用途 |
|---|---|
| `/topstories.json` | トップ記事 ID リスト（最大 500 件） |
| `/item/<id>.json` | 記事詳細（title, url, score, descendants, by など） |

### 定数・調整ポイント

| 定数 | ファイル | 意味 |
|---|---|---|
| `FETCH_N` | `cli.ts` (デフォルト値) | API から取得する記事数（デフォルト 30） |
| `TOP_N` | `cli.ts` (デフォルト値) | スコア上位から選ぶ件数（デフォルト 5） |
| `RATE_LIMIT_MS` | `hn_client.ts` | リクエスト間隔（デフォルト 1000ms） |

## セッション振り返り（2026-04-02）

### うまくいった指示のパターン

- **具体的な処理の列挙**：「スコア上位5件だけフィルタ → コメント数も取得 → スコア/コメント比で並べ替え」のように、ステップを箇条書きで渡すと一発で意図が伝わった。
- **動作確認してから次の指示**：ユーザー自身が `curl` で API レスポンスを確認してから実装依頼に移ったため、仕様の認識ズレがなかった。
- **「覚えておいて」で明示的にメモリ保存**：レートリミット対応・出力形式など、曖昧に流さず明示的に記憶指示を出したことで確実に保存できた。

### 手戻りが発生した場面とその原因

- **`hn-summary.sh` の二重実装**：最初に「Claude API で翻訳」の実装を行ったが、コスト確認の後に翻訳を断念。Claude Code CLI を使うスクリプトとして全面書き直しになった。**原因**：API コストの確認が実装後になった。機能要件を固める前に実装に入ったことが手戻りの原因。

### 次回のセッションで気をつけるべきこと

- **外部 API 連携を実装する前にコスト・認証要件を確認する**：「API を使う」と決まった時点で、料金・キーの有無をユーザーに確認してから実装に着手する。
- **出力形式・言語を最初に合意する**：今回は途中で「Markdown・日本語」が明示されたが、最初に確認しておくと手戻りを防げる。
