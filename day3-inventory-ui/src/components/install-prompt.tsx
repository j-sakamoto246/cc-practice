"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, ShareIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isRecentlyDismissed() {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < DISMISS_TTL_MS;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // biome-ignore lint: iOS Safari の旧プロパティ
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    setIsIOS(ios);

    if (standalone || isRecentlyDismissed()) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    if (ios) setVisible(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    setDeferred(null);
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "dismissed") {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    setVisible(false);
    setDeferred(null);
  };

  if (isStandalone || !visible) return null;

  return (
    <div
      role="dialog"
      aria-label="アプリのインストール"
      className="bg-background fixed right-4 bottom-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-xl border p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div
          className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg"
          aria-hidden
        >
          <DownloadIcon className="size-5" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold">アプリをインストール</p>
          {isIOS ? (
            <p className="text-muted-foreground text-xs leading-relaxed">
              <ShareIcon className="mr-1 inline size-3 align-middle" aria-hidden />
              共有ボタン →「ホーム画面に追加」でインストールできます。
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              ホーム画面に追加してオフラインでも利用できます。
            </p>
          )}
          {!isIOS && (
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={install} disabled={!deferred}>
                インストール
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                後で
              </Button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 rounded p-1"
          aria-label="閉じる"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
