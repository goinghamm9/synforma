"use client";
import * as React from "react";

/**
 * Whole seconds elapsed while `active` is true, re-rendering once a second; 0 while it is false. A change
 * of `key` restarts the count (a new connect attempt). The clock lives inside the effect so that rendering
 * stays pure.
 */
export function useSecondsWhile(active: boolean, key: unknown = null): number {
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [active, key]);
  return active ? seconds : 0;
}
