import { cn } from "@/lib/utils";

/**
 * SYNFORMA brand mark: an angular human mind whose internal structure
 * becomes computational. Rendered as inline SVG so it inherits `currentColor`.
 * Drop the original raster/vector into /public/brand to replace this rendition.
 */
export function SynformaMark({ className, strokeWidth = 5 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 128 112"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <path d="M60 12 L34 20 L20 38 L18 60 L28 78 L44 92 L60 98 L60 12 Z" />
      <path d="M68 12 L94 20 L108 38 L110 60 L100 78 L84 92 L68 98 L68 12 Z" />
      <path d="M34 34 L48 34 L48 46" />
      <path d="M28 56 L40 56 L40 70 L52 70" />
      <path d="M44 80 L52 80 L52 88" />
      <circle cx="34" cy="34" r="3" fill="currentColor" stroke="none" />
      <circle cx="52" cy="70" r="3" fill="currentColor" stroke="none" />
      <circle cx="52" cy="88" r="3" fill="currentColor" stroke="none" />
      <path d="M94 34 L80 34 L80 46 L88 46" />
      <path d="M100 56 L86 56 L86 66" />
      <path d="M76 78 L88 78 L88 88" />
      <circle cx="88" cy="46" r="3" fill="currentColor" stroke="none" />
      <circle cx="86" cy="66" r="3" fill="currentColor" stroke="none" />
      <circle cx="76" cy="78" r="3" fill="currentColor" stroke="none" />
      <path d="M60 98 L60 108 M68 98 L68 108" />
    </svg>
  );
}

export function SynformaWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-sans font-semibold tracking-[0.22em] text-[0.8rem] uppercase", className)}>
      Synforma
    </span>
  );
}

export function SynformaLogo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      <SynformaMark className={cn("h-6 w-6", markClassName)} />
      <SynformaWordmark />
    </span>
  );
}
