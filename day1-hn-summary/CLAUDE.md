# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

Hacker News のトップ記事を取得し、スコア/コメント比で並べ替えた Markdown レポートを生成するシェルスクリプト群。

## 実行方法

```bash
# 記事データのみ取得・表示（Markdown テーブル）
./hn-top10.sh

# 記事取得 + Claude Code による日本語サマリー生成（Markdown 全体）
./hn-summary.sh
```

`hn-summary.sh` の実行には `claude` CLI（Claude Code）がインストールされ、認証済みである必要がある。

## 依存コマンド

- `curl` — HN API および Claude API への HTTP リクエスト
- `jq` — JSON のパース・変換・フィルタリング
- `claude` — Claude Code CLI（`hn-summary.sh` のみ）

## アーキテクチャ

### スクリプトの関係

```
hn-summary.sh
  └─ hn-top10.sh を呼び出し（サブプロセス）
       └─ HN Firebase API からデータ取得・整形
  └─ claude -p に結果を渡してサマリー生成
```

### データフロー（hn-top10.sh）

1. `topstories.json` から上位 30 件の ID を取得
2. 各 ID に対して `item/<id>.json` を順次取得
3. `title / url / score / descendants` を jq で JSON 配列に集約
4. スコア降順で上位 5 件に絞り込み
5. `ratio = score / descendants`（コメント 0 の場合は score そのまま）を計算
6. ratio 降順でソートし Markdown テーブルとして出力

### HN API エンドポイント（ベース URL: `https://hacker-news.firebaseio.com/v0`）

| エンドポイント | 用途 |
|---|---|
| `/topstories.json` | トップ記事 ID リスト（最大 500 件） |
| `/item/<id>.json` | 記事詳細（title, url, score, descendants, by など） |

## 定数・調整ポイント

| 変数 | ファイル | 意味 |
|---|---|---|
| `FETCH_N` | hn-top10.sh | API から取得する記事数（デフォルト 30） |
| `TOP_N` | hn-top10.sh | スコア上位から選ぶ件数（デフォルト 5） |

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
