import type { ReactNode } from "react";

export function SwapIcon({
  active,
  idle,
  done,
  size = 18,
}: {
  active: boolean;
  idle: ReactNode;
  done: ReactNode;
  size?: number;
}) {
  return (
    <span
      className="icon-swap"
      data-active={active}
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <span className="icon-swap-idle">{idle}</span>
      <span className="icon-swap-done">{done}</span>
    </span>
  );
}
