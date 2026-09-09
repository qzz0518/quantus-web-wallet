import { useSyncExternalStore } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallState = {
  installed: boolean;
  canPrompt: boolean;
  isIOS: boolean;
  secure: boolean;
};

const emptyState: InstallState = {
  installed: false,
  canPrompt: false,
  isIOS: false,
  secure: false,
};
let state = emptyState;
let deferredPrompt: InstallPrompt | null = null;
let initialized = false;
let installed = false;
const listeners = new Set<() => void>();

function refresh() {
  const next = {
    installed:
      installed ||
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    canPrompt: deferredPrompt !== null,
    isIOS:
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    secure: window.isSecureContext,
  };
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  for (const listener of listeners) listener();
}

export function initializePwa() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event as InstallPrompt;
    refresh();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    refresh();
  });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", refresh);
  refresh();
  if (import.meta.env.PROD && window.isSecureContext && "serviceWorker" in navigator) {
    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Installation is optional; failed caching must not block wallet use.
        });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }
}

export async function installPwa() {
  const prompt = deferredPrompt;
  if (!prompt) return;
  deferredPrompt = null;
  refresh();
  await prompt.prompt();
  await prompt.userChoice;
}

export function usePwaInstall() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => emptyState,
  );
}
