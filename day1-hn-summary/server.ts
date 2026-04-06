import { Hono } from "hono";
import { fetchMultiSource } from "./multi_client.ts";
import type { RankedSourceStory, SourceName } from "./multi_client.ts";

const SOURCES: SourceName[] = ["hn", "lobsters", "devto", "reddit"];
const FETCH_N = 30;
const TOP_N = 10;

const app = new Hono();
const clients = new Set<WebSocket>();
let cachedStories: RankedSourceStory[] = [];
let previousUrls = new Set<string>();

// ---- WebSocket ブロードキャスト ----

function broadcast(payload: unknown): void {
  const message = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

// ---- Claude CLI による日本語タイトル翻訳 ----

async function translateTitles(titles: string[]): Promise<string[]> {
  const prompt =
    `以下の英語ニュースタイトルを自然な日本語に翻訳してください。
固有名詞・技術用語はそのまま残してください。
結果は JSON 配列（文字列のみ）で、入力と同じ順序・同じ件数で返してください。
他の文章は一切出力しないでください。

${JSON.stringify(titles)}`;

  const cmd = new Deno.Command("claude", {
    args: ["-p", "-"],
    stdin: "piped",
    stdout: "piped",
    stderr: "inherit",
  });

  console.log(`[translate] Spawning claude -p (${titles.length} titles)...`);
  const process = cmd.spawn();
  const writer = process.stdin.getWriter();
  await writer.write(new TextEncoder().encode(prompt));
  await writer.close();

  const { stdout, code } = await process.output();
  const raw = new TextDecoder().decode(stdout).trim();
  console.log(`[translate] claude exited with code ${code}, response length=${raw.length}`);
  console.log(`[translate] raw: ${raw.slice(0, 200)}`);

  // JSON 配列部分を抽出してパース
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`翻訳レスポンスのパースに失敗: ${raw.slice(0, 200)}`);
  const translated: unknown = JSON.parse(match[0]);
  if (!Array.isArray(translated) || translated.length !== titles.length) {
    throw new Error(`翻訳件数が不一致: expected ${titles.length}, got ${Array.isArray(translated) ? translated.length : "non-array"}`);
  }
  return translated.map(String);
}

// ---- ポーリング ----

async function poll(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Polling ${SOURCES.join(", ")}...`);
  try {
    const ranked = await fetchMultiSource(SOURCES, FETCH_N, TOP_N);

    // claude -p で日本語タイトルを付与
    let storiesWithJa: (typeof ranked[number] & { titleJa: string })[];
    try {
      console.log(`[${new Date().toISOString()}] Starting translation (${ranked.length} titles)...`);
      const jatitles = await translateTitles(ranked.map((s) => s.title));
      storiesWithJa = ranked.map((s, i) => ({ ...s, titleJa: jatitles[i] }));
      console.log(`[${new Date().toISOString()}] Translation done. Example: "${jatitles[0]}"`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Translation failed, falling back to original titles:`, err);
      storiesWithJa = ranked.map((s) => ({ ...s, titleJa: s.title }));
    }

    const currentUrls = new Set(ranked.map((s) => s.url));
    const newUrls = [...currentUrls].filter((u) => !previousUrls.has(u));

    cachedStories = storiesWithJa as typeof cachedStories;
    previousUrls = currentUrls;

    broadcast({ type: "update", stories: storiesWithJa, newUrls, timestamp: new Date().toISOString() });
    console.log(
      `[${new Date().toISOString()}] Broadcasted ${ranked.length} stories (${newUrls.length} new)`,
    );
  } catch (err) {
    console.error("Poll error:", err);
  }
}

// 起動直後に初回フェッチ、以降 60 秒ごと
await poll();
setInterval(poll, 60_000);

// ---- ルート ----

app.get("/ws", (c) => {
  const { socket, response } = Deno.upgradeWebSocket(c.req.raw);

  socket.onopen = () => {
    clients.add(socket);
    console.log(`[WS] Client connected (total: ${clients.size})`);
    if (cachedStories.length > 0) {
      socket.send(
        JSON.stringify({
          type: "initial",
          stories: cachedStories,
          newUrls: [],
          timestamp: new Date().toISOString(),
        }),
      );
    }
  };

  socket.onclose = () => {
    clients.delete(socket);
    console.log(`[WS] Client disconnected (total: ${clients.size})`);
  };

  socket.onerror = (e) => {
    console.error("[WS] Error:", e);
  };

  return response;
});

app.get("/", (c) => c.html(HTML));

// ---- HTML クライアント ----

const SOURCE_COLORS: Record<string, string> = {
  hn: "#ff6600",
  lobsters: "#ac130d",
  devto: "#3b49df",
  reddit: "#ff4500",
};

const HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ニュースリアルタイムフィード</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f6f6ef; color: #333; padding: 1rem; }
    h1 { font-size: 1.2rem; color: #ff6600; margin-bottom: 0.5rem; }
    #status { font-size: 0.8rem; color: #666; margin-bottom: 1rem; }
    #status.connected { color: #2a9d2a; }
    #status.disconnected { color: #c0392b; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #e8e8e8; font-size: 0.9rem; }
    th { background: #555; color: #fff; font-weight: 600; }
    tr:hover td { background: #fffaf0; }
    td.rank { width: 2.5rem; text-align: center; font-weight: bold; color: #666; }
    td.source { width: 6rem; }
    td.score, td.comments, td.normalized { width: 5rem; text-align: right; color: #666; }
    a { color: #000; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .src-badge { display: inline-block; font-size: 0.7rem; color: #fff;
                 border-radius: 3px; padding: 1px 5px; font-weight: 600; }
    .new-badge { display: inline-block; font-size: 0.7rem; background: #e00; color: #fff;
                 border-radius: 3px; padding: 1px 4px; margin-left: 4px; vertical-align: middle; }
    #last-update { font-size: 0.75rem; color: #888; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <h1>ニュース リアルタイムフィード（HN / Lobsters / Dev.to / Reddit）— Claude 日本語訳付き</h1>
  <div id="status" class="disconnected">接続中...</div>
  <table>
    <thead>
      <tr>
        <th class="rank">#</th>
        <th class="source">ソース</th>
        <th>タイトル（日本語）</th>
        <th>原題</th>
        <th class="score">スコア</th>
        <th class="normalized">正規化</th>
        <th class="comments">コメント</th>
      </tr>
    </thead>
    <tbody id="tbody"></tbody>
  </table>
  <div id="last-update"></div>
  <script>
    const SOURCE_COLORS = ${JSON.stringify(SOURCE_COLORS)};
    const statusEl = document.getElementById('status');
    const tbodyEl = document.getElementById('tbody');
    const lastUpdateEl = document.getElementById('last-update');
    let ws;

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(proto + '://' + location.host + '/ws');

      ws.onopen = () => {
        statusEl.textContent = '接続中 ✓';
        statusEl.className = 'connected';
      };

      ws.onclose = () => {
        statusEl.textContent = '切断 — 3秒後に再接続...';
        statusEl.className = 'disconnected';
        setTimeout(connect, 3000);
      };

      ws.onerror = () => { ws.close(); };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        render(msg.stories, msg.newUrls || [], msg.timestamp);
      };
    }

    function render(stories, newUrls, timestamp) {
      const newSet = new Set(newUrls);
      tbodyEl.innerHTML = stories.map(s => {
        const color = SOURCE_COLORS[s.source] || '#888';
        const srcBadge = \`<span class="src-badge" style="background:\${color}">\${s.source}</span>\`;
        const newBadge = newSet.has(s.url) ? '<span class="new-badge">NEW</span>' : '';
        const ja = s.titleJa || s.title;
        return \`<tr>
          <td class="rank">\${s.rank}</td>
          <td class="source">\${srcBadge}</td>
          <td><a href="\${s.url}" target="_blank" rel="noopener">\${escHtml(ja)}</a>\${newBadge}</td>
          <td style="font-size:0.8rem;color:#999">\${escHtml(s.title)}</td>
          <td class="score">\${s.score}</td>
          <td class="normalized">\${s.normalizedScore}</td>
          <td class="comments">\${s.comments}</td>
        </tr>\`;
      }).join('');
      lastUpdateEl.textContent = '最終更新: ' + new Date(timestamp).toLocaleTimeString('ja-JP');
    }

    function escHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    connect();
  </script>
</body>
</html>`;

// ---- 起動 ----

const PORT = 8080;
console.log(`Server running at http://localhost:${PORT}`);
Deno.serve({ port: PORT }, app.fetch);
