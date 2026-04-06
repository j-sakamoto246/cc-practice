// Entry point — equivalent to hn-top10.sh
// Pipeline: parse args → fetch → select top N → filter → rank → format → stdout

import { parseArgs } from "./cli.ts";
import { fetchTopStories } from "./hn_client.ts";
import { filterByMinComments, rankStories, selectTopN } from "./ranking.ts";
import { formatHtml, formatJson, formatMarkdown } from "./formatters.ts";

const opts = parseArgs(Deno.args);

const rawStories = await fetchTopStories(opts.fetchN);
const top = selectTopN(rawStories, opts.topN);
const filtered = filterByMinComments(top, opts.minComments);

if (filtered.length === 0) {
  console.error(
    `該当する記事が見つかりませんでした。--min-comments の値（${opts.minComments}）を下げてみてください。`,
  );
  Deno.exit(1);
}

const ranked = rankStories(filtered);
const date = new Date().toISOString().slice(0, 10);

switch (opts.format) {
  case "markdown":
    console.log(formatMarkdown(ranked, date, opts.topN));
    break;
  case "html":
    console.log(formatHtml(ranked, date));
    break;
  case "json":
    console.log(formatJson(ranked));
    break;
}
