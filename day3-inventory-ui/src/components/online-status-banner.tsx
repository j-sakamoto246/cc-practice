"use client";

import { useEffect, useState } from "react";
import { CloudOffIcon, RefreshCwIcon, WifiOffIcon, CheckCircle2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

type SyncState = "idle" | "queued" | "syncing" | "synced" | "failed";

export function OnlineStatusBanner() {
  const [online, setOnline] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>("idle");

  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);

    const onOnline = () => {
      setOnline(true);
      if (syncState === "queued") setSyncState("syncing");
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (!data?.type) return;
      if (data.type === "sync-queued") setSyncState("queued");
      else if (data.type === "sync-replayed") setSyncState("syncing");
      else if (data.type === "sync-drained") {
        setSyncState("synced");
        window.setTimeout(() => setSyncState("idle"), 3000);
      } else if (data.type === "sync-failed") setSyncState("failed");
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [syncState]);

  if (online && syncState === "idle") return null;

  const config = !online
    ? {
        icon: WifiOffIcon,
        text: "オフラインです。操作は復帰後に同期されます。",
        tone: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
      }
    : syncState === "queued"
      ? {
          icon: CloudOffIcon,
          text: "未同期の操作があります。オンライン復帰時に送信します。",
          tone: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
        }
      : syncState === "syncing"
        ? {
            icon: RefreshCwIcon,
            text: "オフライン中の操作を同期しています…",
            tone: "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
          }
        : syncState === "synced"
          ? {
              icon: CheckCircle2Icon,
              text: "同期が完了しました。",
              tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
            }
          : {
              icon: CloudOffIcon,
              text: "同期に失敗しました。後で自動的に再試行されます。",
              tone: "bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
            };

  const Icon = config.icon;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium",
        config.tone,
      )}
    >
      <Icon
        className={cn("size-4", syncState === "syncing" && "animate-spin")}
        aria-hidden="true"
      />
      <span>{config.text}</span>
    </div>
  );
}
