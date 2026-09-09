import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export const MOTION_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const running = new Set<Animation>();
const exits = new WeakMap<HTMLDialogElement, () => void>();

export function motionAllowed() {
  return (
    typeof window !== "undefined" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    document.documentElement.dataset.inputMode !== "keyboard"
  );
}

export function trackMotion(animation: Animation) {
  running.add(animation);
  void animation.finished
    .catch(() => {})
    .finally(() => running.delete(animation));
  return animation;
}

/** Runs on the current DOM only; outgoing wallet contents are never retained. */
export function reveal(element: Element | null, x = 0, y = 8, duration = 220) {
  if (!element || !motionAllowed() || !element.animate) return;
  const animation = element.animate(
    [
      { opacity: 0, transform: `translate(${x}px, ${y}px)` },
      { opacity: 1, transform: "translate(0, 0)" },
    ],
    { duration, easing: MOTION_EASE },
  );
  return trackMotion(animation);
}

export function useReveal<T extends HTMLElement>(
  ref: RefObject<T | null>,
  key: string,
  y = 8,
) {
  const previous = useRef(key);
  useLayoutEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    const animation = reveal(ref.current, 0, y);
    return () => animation?.cancel();
  }, [ref, key, y]);
}

/** Only explicit user dismissal is delayed. Lock/replacement must unmount directly. */
export function dismissModal(action: () => void) {
  const dialog =
    document.querySelector<HTMLDialogElement>("dialog.modal[open]");
  if (!dialog || dialog.dataset.exiting === "complete" || !motionAllowed()) {
    action();
    return;
  }
  if (exits.has(dialog)) return;
  let settled = false;
  let timeout: ReturnType<typeof setTimeout>;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    exits.delete(dialog);
    // A lock or replacement removes this instance: never close its successor.
    if (!dialog.isConnected || !dialog.open) return;
    dialog.dataset.exiting = "complete";
    action();
  };
  exits.set(dialog, finish);
  dialog.inert = true;
  dialog.dataset.exiting = "true";
  // CSS owns interpolation, including reversing an unfinished entrance.
  // A bound also covers background tabs and interrupted/cancelled transitions.
  timeout = setTimeout(finish, 210);
  const transitions = dialog
    .getAnimations()
    .filter((a) => a.effect?.getTiming().iterations !== Infinity);
  if (!transitions.length) finish();
  else
    void Promise.all(transitions.map((a) => a.finished.catch(() => {}))).then(
      finish,
    );
}

export function useMotionPreferences() {
  useEffect(() => {
    const root = document.documentElement;
    const pointer = () => {
      root.dataset.inputMode = "pointer";
    };
    const stop = () => {
      running.forEach((a) => a.cancel());
      document
        .querySelectorAll<HTMLDialogElement>('dialog[data-exiting="true"]')
        .forEach((d) => exits.get(d)?.());
    };
    const keyboard = (event: KeyboardEvent) => {
      if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
      root.dataset.inputMode = "keyboard";
      stop();
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => {
      if (reduce.matches) stop();
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    reduce.addEventListener("change", changed);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
      reduce.removeEventListener("change", changed);
      running.forEach((a) => a.cancel());
    };
  }, []);
}
