import { useEffect, useSyncExternalStore } from "react";
import { UNIT } from "./amount";
import { fetchMarketPrice, type MarketPrice } from "./mining/data";

/** How old a quote may get before a mounted reader asks the exchange again. */
export const MARKET_REFRESH_MS = 60_000;

let quote: MarketPrice | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Fetch the QUAN/USDT quote once for every reader; a failure keeps the last good quote. */
export function refreshMarketPrice(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetchMarketPrice()
    .then((next) => {
      quote = next;
      for (const listener of listeners) listener();
    })
    .catch(() => {
      // The exchange turns some visitors away; the value line simply stays empty.
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const read = () => quote;
const none = () => null;

/** The latest quote, refreshed every minute while a reader is mounted and the tab is visible. */
export function useMarketPrice(): MarketPrice | null {
  const price = useSyncExternalStore(subscribe, read, none);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer !== null) return;
      if (!quote || Date.now() - quote.fetchedAt > MARKET_REFRESH_MS) void refreshMarketPrice();
      timer = setInterval(() => void refreshMarketPrice(), MARKET_REFRESH_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return price;
}

/** Value of an on-chain amount at a unit price; USDT counts as USD. */
export function fiatValue(amount: bigint, price: number): number {
  const whole = Number(amount / UNIT);
  const fraction = Number(amount % UNIT) / Number(UNIT);
  return (whole + fraction) * price;
}

/**
 * Dollar text for a balance (`precise` is for a unit price, which needs more
 * digits to be useful): thousands drop the cents, small values keep two or
 * four significant digits.
 */
export function formatUsd(value: number, precise = false): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  let text: string;
  if (value >= 1000) text = value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  else if (value >= 1 || value === 0) text = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  else text = value.toLocaleString("en-US", { maximumSignificantDigits: precise ? 4 : 2, maximumFractionDigits: 8 });
  return `$${text}`;
}
