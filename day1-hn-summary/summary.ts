// Entry point — equivalent to hn-summary.sh
// Runs main.ts to get the Markdown table, then pipes it to `claude -p` for a Japanese summary.

import { fetchTopStories } from "./hn_client.ts";
import { filterByMinComments, rankStories, selectTopN } from "./ranking.ts";
import { formatMarkdown } from "./formatters.ts";

const FETCH_N = 30;
const TOP_N = 5;

const rawStories = await fetchTopStories(FETCH_N);
const top = selectTopN(rawStories, TOP_N);
const ranked = rankStories(filterByMinComments(top, 0));
const date = new Date().toISOString().slice(0, 10);
const hnTable = formatMarkdown(ranked, date, TOP_N);

const prompt = `以下は本日 (${date}) の Hacker News スコア/コメント比トップ5記事の一覧です。
各記事のタイトルから内容を推測し、1〜2文の日本語でサマリーを作成してください。
URLへのアクセスは不要です。Markdown の箇条書き形式で出力してください。

${hnTable}`;

const cmd = new Deno.Command("claude", {
  args: ["-p", "-"],
  stdin: "piped",
  stdout: "piped",
  stderr: "inherit",
});

const process = cmd.spawn();
const writer = process.stdin.getWriter();
await writer.write(new TextEncoder().encode(prompt));
await writer.close();

const { stdout } = await process.output();
const summary = new TextDecoder().decode(stdout);

console.log(`# Hacker News サマリー — ${date}

${hnTable}

## 各記事のサマリー（Claude による要約）

${summary}`);
