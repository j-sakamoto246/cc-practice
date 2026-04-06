import { Hono } from "hono";
import { fetchTopStories } from "./hn_client.ts";
import { rankStories, selectTopN } from "./ranking.ts";
import type { RankedStory } from "./types.ts";

const app = new Hono();
const clients = new Set<WebSocket>();
let cachedStories: RankedStory[] = [];
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

// ---- HN API ポーリング ----

async function poll(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Polling HN API...`);
  try {
    const raw = await fetchTopStories(30);
    const ranked = rankStories(selectTopN(raw, 10));

    const currentUrls = new Set(ranked.map((s) => s.url));
    const newUrls = [...currentUrls].filter((u) => !previousUrls.has(u));

    cachedStories = ranked;
    previousUrls = currentUrls;

    broadcast({ type: "update", stories: ranked, newUrls, timestamp: new Date().toISOString() });
    console.log(`[${new Date().toISOString()}] Broadcasted ${ranked.length} stories (${newUrls.length} new)`);
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
        JSON.stringify({ type: "initial", stories: cachedStories, newUrls: [], timestamp: new Date().toISOString() }),
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

const HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HN リアルタイムフィード</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f6f6ef; color: #333; padding: 1rem; }
    h1 { font-size: 1.2rem; color: #ff6600; margin-bottom: 0.5rem; }
    #status { font-size: 0.8rem; color: #666; margin-bottom: 1rem; }
    #status.connected { color: #2a9d2a; }
    #status.disconnected { color: #c0392b; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #e8e8e8; font-size: 0.9rem; }
    th { background: #ff6600; color: #fff; font-weight: 600; }
    tr:hover td { background: #fffaf0; }
    td.rank { width: 2.5rem; text-align: center; font-weight: bold; color: #666; }
    td.score, td.comments, td.ratio { width: 5rem; text-align: right; color: #666; }
    a { color: #000; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .new-badge { display: inline-block; font-size: 0.7rem; background: #ff6600; color: #fff;
                 border-radius: 3px; padding: 1px 4px; margin-left: 4px; vertical-align: middle; }
    #last-update { font-size: 0.75rem; color: #888; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <h1>Hacker News リアルタイムフィード</h1>
  <div id="status" class="disconnected">接続中...</div>
  <table>
    <thead>
      <tr>
        <th class="rank">#</th>
        <th>タイトル</th>
        <th class="score">スコア</th>
        <th class="comments">コメント</th>
        <th class="ratio">比率</th>
      </tr>
    </thead>
    <tbody id="tbody"></tbody>
  </table>
  <div id="last-update"></div>
  <script>
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

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        render(msg.stories, msg.newUrls || [], msg.timestamp);
      };
    }

    function render(stories, newUrls, timestamp) {
      const newSet = new Set(newUrls);
      tbodyEl.innerHTML = stories.map(s => {
        const badge = newSet.has(s.url) ? '<span class="new-badge">NEW</span>' : '';
        return \`<tr>
          <td class="rank">\${s.rank}</td>
          <td><a href="\${s.url}" target="_blank" rel="noopener">\${escHtml(s.title)}</a>\${badge}</td>
          <td class="score">\${s.score}</td>
          <td class="comments">\${s.descendants}</td>
          <td class="ratio">\${s.ratio}</td>
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
