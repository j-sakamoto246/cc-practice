"use client";

import { Profiler as ReactProfiler, type ProfilerOnRenderCallback, type ReactNode } from "react";

const PROFILING_ENABLED =
  process.env.NEXT_PUBLIC_PROFILE === "1" || process.env.NODE_ENV === "development";

type Bucket = {
  mounts: number;
  mountTotal: number;
  updates: number;
  updateTotal: number;
  baseTotal: number;
  maxActual: number;
};

declare global {
  interface Window {
    __profilerData__?: Map<string, Bucket>;
    dumpProfilerData?: () => Record<string, Bucket & { avgUpdate: number; avgMount: number }>;
    resetProfilerData?: () => void;
  }
}

const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration) => {
  if (typeof window === "undefined") return;
  const store = (window.__profilerData__ ??= new Map());
  const cur = store.get(id) ?? {
    mounts: 0,
    mountTotal: 0,
    updates: 0,
    updateTotal: 0,
    baseTotal: 0,
    maxActual: 0,
  };
  if (phase === "mount" || phase === "nested-update") {
    cur.mounts += 1;
    cur.mountTotal += actualDuration;
  } else {
    cur.updates += 1;
    cur.updateTotal += actualDuration;
  }
  cur.baseTotal += baseDuration;
  if (actualDuration > cur.maxActual) cur.maxActual = actualDuration;
  store.set(id, cur);
};

if (typeof window !== "undefined" && PROFILING_ENABLED) {
  window.dumpProfilerData = () => {
    const store = window.__profilerData__ ?? new Map();
    const out: Record<string, Bucket & { avgUpdate: number; avgMount: number }> = {};
    for (const [id, b] of store) {
      out[id] = {
        ...b,
        avgMount: b.mounts > 0 ? b.mountTotal / b.mounts : 0,
        avgUpdate: b.updates > 0 ? b.updateTotal / b.updates : 0,
      };
    }
    return out;
  };
  window.resetProfilerData = () => {
    window.__profilerData__ = new Map();
  };
}

export function Profiler({ id, children }: { id: string; children: ReactNode }) {
  if (!PROFILING_ENABLED) return <>{children}</>;
  return (
    <ReactProfiler id={id} onRender={onRender}>
      {children}
    </ReactProfiler>
  );
}
