"use client";

/// <reference types="@serwist/next/typings" />

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.serwist) return;
    window.serwist.register().catch((error) => {
      console.error("[sw] registration failed", error);
    });
  }, []);

  return null;
}
