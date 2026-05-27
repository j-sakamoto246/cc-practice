# 負荷テスト所見 (load-test findings)

`load-tests/` を実行した結果と、観察されたボトルネック・改善提案を記録する。

実装直後はスケルトン。初回フル実行 (`npm run loadtest`) 後に「## YYYY-MM-DD 実行」セクションを追記する運用。改善コードは本ドキュメントではなく別 PR で扱う。

---

## テンプレート (コピー用)

```markdown
## YYYY-MM-DD 実行 #N

### 環境

- コミット: `<git rev-parse HEAD>`
- ハードウェア: <CPU / RAM / OS>
- Node: `<node -v>` / k6: `<k6 version>`
- サーバモード: dev / production build
- DB: `data/load-test.db` (rows: products=6, warehouses=3, ...)

### シナリオ結果

| シナリオ         | RPS | p50 | p95 | p99 | エラー率 | 閾値 (p95<500) |
| ---------------- | --- | --- | --- | --- | -------- | -------------- |
| products-list    |     |     |     |     |          |                |
| stock-operations |     |     |     |     |          |                |
| order-creation   |     |     |     |     |          |                |
| full-suite       |     |     |     |     |          |                |

### 6 ステップ観察 (`load-tests/README.md` 参照)

1. **エンドポイント別 p95/p99**:
2. **VU 段階ごとの劣化曲線** (10 / 50 / 100):
3. **エラー率の跳ね地点**:
4. **SQLite/libSQL 特有**:
5. **Next.js 16 特有** (dev vs prod の差):
6. **OS リソース** (CPU / RSS / FD):

### ボトルネック仮説と改善提案 (優先度付き)

- [ ] [高] …
- [ ] [中] …
- [ ] [低] …

### 添付

- HTML: `load-tests/reports/full-suite-<timestamp>.html`
- JSON: `load-tests/reports/full-suite-<timestamp>.json`
```

---

## 履歴

<!-- 実行のたびに上記テンプレートを上に追記する -->
