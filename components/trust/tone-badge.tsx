import { cn } from "@/lib/utils";
import { TONE_CLASS, type Tone } from "./trust-tone";

export function ToneBadge({ tone, children, className, title }: { tone: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 tracking-wide", TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}
