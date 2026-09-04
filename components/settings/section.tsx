import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A settings section: eyebrow + title + lede above a hairline-divided list of fields. */
export function SettingsSection({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-20 border-t border-line pt-8 sm:pt-10">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${id}-heading`} className="display mt-3 text-2xl text-ink">
        {title}
      </h2>
      {lede ? <p className="mt-3 max-w-2xl text-sm leading-relaxed text-graphite">{lede}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Label + hint on the left, control on the right; stacks on small screens. */
export function FieldRow({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 border-b border-line py-5 last:border-b-0 sm:grid-cols-12 sm:gap-6", className)}>
      <div className="sm:col-span-5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium text-ink">{label}</p>
        )}
        {hint ? <div className="mt-1 text-[13px] leading-relaxed text-slate">{hint}</div> : null}
      </div>
      <div className="sm:col-span-7">{children}</div>
    </div>
  );
}

/** Inline status line: observation-style feedback under a control. */
export function StatusLine({ tone = "muted", children }: { tone?: "muted" | "verdant" | "signal" | "amber"; children: ReactNode }) {
  return (
    <p
      role={tone === "signal" ? "alert" : "status"}
      className={cn(
        "mt-2 text-[13px] leading-relaxed",
        tone === "muted" && "text-slate",
        tone === "verdant" && "text-verdant",
        tone === "signal" && "text-signal",
        tone === "amber" && "text-amber",
      )}
    >
      {children}
    </p>
  );
}
