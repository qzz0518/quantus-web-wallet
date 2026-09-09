import { afterEach, describe, expect, it } from "bun:test";
import { dismissModal } from "../src/lib/motion";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);
afterEach(() => {
  for (const [key, descriptor] of [
    ["window", originalWindow],
    ["document", originalDocument],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
function scene(reduced = false, keyboard = false) {
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const dialog = {
    dataset: {} as Record<string, string>,
    inert: false,
    isConnected: true,
    open: true,
    getAnimations: () => [
      { finished, effect: { getTiming: () => ({ iterations: 1 }) } },
    ],
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: reduced }) },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: {
        dataset: { inputMode: keyboard ? "keyboard" : "pointer" },
      },
      querySelector: () => dialog,
    },
  });
  return {
    dialog,
    finish: async () => {
      finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe("dialog motion lifecycle", () => {
  it("blocks interaction immediately and commits one close after the exit", async () => {
    const { dialog, finish } = scene();
    let closes = 0;
    dismissModal(() => {
      closes++;
    });
    dismissModal(() => {
      closes++;
    });
    expect(dialog.inert).toBe(true);
    expect(closes).toBe(0);
    await finish();
    expect(closes).toBe(1);
  });
  it("never executes an old callback after lock or modal replacement", async () => {
    const { dialog, finish } = scene();
    let successorClosed = false;
    dismissModal(() => {
      successorClosed = true;
    });
    dialog.isConnected = false;
    await finish();
    expect(successorClosed).toBe(false);
  });
  it("supports a shared dismiss handler without starting a second exit", async () => {
    const { finish } = scene();
    let closes = 0;
    dismissModal(() =>
      dismissModal(() => {
        closes++;
      }),
    );
    await finish();
    expect(closes).toBe(1);
  });
  it("does not delay reduced-motion or keyboard navigation", () => {
    for (const [reduced, keyboard] of [
      [true, false],
      [false, true],
    ]) {
      const { dialog } = scene(reduced, keyboard);
      let closed = false;
      dismissModal(() => {
        closed = true;
      });
      expect(closed).toBe(true);
      expect(dialog.inert).toBe(false);
    }
  });
  it("cannot strand an inert dialog if the browser drops transition events", async () => {
    scene();
    let closed = false;
    dismissModal(() => {
      closed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 240));
    expect(closed).toBe(true);
  });
});
