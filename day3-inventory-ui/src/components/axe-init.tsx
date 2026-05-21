"use client";

import { useEffect } from "react";

const IS_DEV = process.env.NODE_ENV !== "production";

function AxeInitDev() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const { default: axe } = await import("axe-core");
      if (cancelled) return;

      const run = async () => {
        try {
          const results = await axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
          });
          if (cancelled || results.violations.length === 0) return;
          for (const v of results.violations) {
            const summary = `${v.help} (${v.id}) — ${v.nodes.length} node(s)`;
            console.warn(`[axe] ${summary}`, v.nodes.map((n) => n.target).slice(0, 5));
          }
        } catch (err) {
          console.warn("[axe] run failed", err);
        }
      };

      const schedule = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(run, 1000);
      };

      schedule();
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true });

      return () => {
        observer.disconnect();
        if (timer) clearTimeout(timer);
      };
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}

function AxeInitNoop() {
  return null;
}

export const AxeInit = IS_DEV ? AxeInitDev : AxeInitNoop;
