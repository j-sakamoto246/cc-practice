type ToastModule = typeof import("sonner");

let cached: ToastModule["toast"] | null = null;

async function load() {
  if (cached) return cached;
  const mod = await import("sonner");
  cached = mod.toast;
  return cached;
}

export const toast = {
  success: async (...args: Parameters<ToastModule["toast"]["success"]>) => {
    (await load()).success(...args);
  },
  error: async (...args: Parameters<ToastModule["toast"]["error"]>) => {
    (await load()).error(...args);
  },
  info: async (...args: Parameters<ToastModule["toast"]["info"]>) => {
    (await load()).info(...args);
  },
  warning: async (...args: Parameters<ToastModule["toast"]["warning"]>) => {
    (await load()).warning(...args);
  },
  message: async (...args: Parameters<ToastModule["toast"]["message"]>) => {
    (await load()).message(...args);
  },
};
