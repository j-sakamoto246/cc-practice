/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig, SerwistPlugin } from "serwist";
import { BackgroundSyncPlugin, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_URL = "/offline";
const SYNC_QUEUE_NAME = "inventory-mutations";

const bgSyncPlugin = new BackgroundSyncPlugin(SYNC_QUEUE_NAME, {
  maxRetentionTime: 24 * 60,
  onSync: async ({ queue }) => {
    let entry = await queue.shiftRequest();
    while (entry) {
      try {
        const response = await fetch(entry.request.clone());
        if (!response.ok) throw new Error(`replay failed ${response.status}`);
        broadcast({ type: "sync-replayed", url: entry.request.url, ok: true });
      } catch (error) {
        await queue.unshiftRequest(entry);
        broadcast({ type: "sync-failed", url: entry.request.url });
        throw error;
      }
      entry = await queue.shiftRequest();
    }
    broadcast({ type: "sync-drained" });
  },
});

function broadcast(payload: Record<string, unknown>) {
  self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
    for (const client of clients) client.postMessage(payload);
  });
}

const queueBroadcastPlugin: SerwistPlugin = {
  fetchDidFail: async ({ request }) => {
    broadcast({ type: "sync-queued", url: request.url, method: request.method });
  },
};

const mutationCaching: RuntimeCaching = {
  matcher: ({ sameOrigin, url, request }) =>
    sameOrigin &&
    url.pathname.startsWith("/api/") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method),
  method: "POST",
  handler: new NetworkOnly({ plugins: [queueBroadcastPlugin, bgSyncPlugin] }),
};

const mutationCachingPut: RuntimeCaching = { ...mutationCaching, method: "PUT" };
const mutationCachingPatch: RuntimeCaching = { ...mutationCaching, method: "PATCH" };
const mutationCachingDelete: RuntimeCaching = { ...mutationCaching, method: "DELETE" };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    mutationCaching,
    mutationCachingPut,
    mutationCachingPatch,
    mutationCachingDelete,
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_URL,
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
