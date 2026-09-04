"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({ value, className, tone = "ink" }: { value: number; className?: string; tone?: "ink" | "verdant" | "signal" }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn("h-full transition-[width] duration-500 ease-out", tone === "ink" && "bg-ink", tone === "verdant" && "bg-verdant", tone === "signal" && "bg-signal")}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
