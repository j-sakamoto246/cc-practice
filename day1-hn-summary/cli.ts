// CLI argument parser for main.ts.
// Supports: --format markdown|html|json, --min-comments N, --help

import type { CliOptions } from "./types.ts";

const USAGE = `Usage: deno run --allow-net main.ts [OPTIONS]

Hacker News のトップ記事を取得し、スコア/コメント比で並べ替えて出力します。

Options:
  --help               このヘルプを表示して終了
  --min-comments N     コメント数が N 件以上の記事のみを対象にする（デフォルト: 0）
  --format FORMAT      出力形式を指定する: markdown / html / json（デフォルト: markdown）

設定値:
  FETCH_N   API から取得する記事数（デフォルト: 30）
  TOP_N     スコア上位から絞り込む件数（デフォルト: 5）

依存: Deno の fetch API（curl 不要）
`;

export function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    format: "markdown",
    minComments: 0,
    fetchN: 30,
    topN: 5,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--help":
        opts.help = true;
        break;
      case "--format": {
        const val = args[++i];
        if (!["markdown", "html", "json"].includes(val)) {
          console.error(`Error: --format には markdown / html / json を指定してください。`);
          Deno.exit(1);
        }
        opts.format = val as CliOptions["format"];
        break;
      }
      case "--min-comments": {
        const val = args[++i];
        const n = parseInt(val, 10);
        if (isNaN(n) || n < 0) {
          console.error(`Error: --min-comments には 0 以上の整数を指定してください。`);
          Deno.exit(1);
        }
        opts.minComments = n;
        break;
      }
      default:
        console.error(`Unknown option: ${args[i]}`);
        console.error(USAGE);
        Deno.exit(1);
    }
  }

  if (opts.help) {
    console.log(USAGE);
    Deno.exit(0);
  }

  return opts;
}
