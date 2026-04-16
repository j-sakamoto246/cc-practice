# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # TypeScript compile (tsc)
npm run dev            # Run CLI via tsx (no build needed): npm run dev -- product list
npm test               # Run all tests (vitest run)
npm test -- tests/db/schema.test.ts   # Run a single test file
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
```

## Architecture

CLI-based inventory management system using libSQL (SQLite-compatible), TypeScript, Commander.js.

### Layered structure (src/)

- **commands/** — CLI command definitions (thin wrappers: parse args → call service → format output)
- **services/** — Business logic, orchestrates multiple repositories, uses `client.batch()` for atomic multi-table operations
- **repositories/** — SQL queries only. Each repo receives `Client` via constructor (DI for testability)
- **models/** — Zod schemas + TypeScript types only. No logic
- **db/client.ts** — libSQL singleton. `initDatabase(url?)` creates client + runs migrations. Tests pass `"file::memory:"`
- **db/schema.ts** — All CREATE TABLE statements in FK-dependency order

### Hybrid inventory model

Two tables work together for inventory tracking:

- **`stock_movements`** — Append-only event log of all inventory changes (source of truth). `quantity_change` is positive for inbound, negative for outbound
- **`inventory`** — Cached current stock per product×warehouse (fast reads)

Every inventory change must atomically (via `client.batch()`):
1. INSERT into `stock_movements`
2. UPDATE `inventory.quantity`
3. INSERT into `transactions` (accounting record, when applicable)

`stock_movements` is the authoritative source; `inventory` can be rebuilt from it.

### Database

12 tables total. All use TEXT primary keys (`crypto.randomUUID()`). Soft delete via `is_active` flag on master tables. Dates stored as ISO 8601 TEXT. `updated_at` must be set explicitly in repository code (no DB trigger).

### Testing

- `tests/setup.ts` runs `beforeEach` → fresh in-memory DB per test
- Import `getClient()` from `src/db/client.ts` in tests to access the DB
- Vitest with explicit imports (`globals: false`)

### Change request rules

曖昧な指示（「改善して」「よくして」等）では作業を開始しない。必ず以下を確認してから着手する:

1. **対象ファイル・関数名** — どこを変更するか
2. **受け入れ条件** — 何ができれば完了か
3. **不明な場合は確認を求める** — 推測で実装しない

### Key conventions

- ESM throughout (`"type": "module"` in package.json). Use `.js` extensions in import paths for compiled output
- TypeScript strict mode with `noUncheckedIndexedAccess`
- ESLint 9 flat config (`eslint.config.js`)
