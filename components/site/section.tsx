import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-6 sm:px-8", className)}>{children}</div>;
}

export function Section({
  id,
  className,
  innerClassName,
  children,
}: {
  id?: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-16 border-t border-line", className)}>
      <Container className={cn("py-20 sm:py-28", innerClassName)}>{children}</Container>
    </section>
  );
}

/**
 * Journal-style section header: index + eyebrow + statement on the left,
 * the lede on the right. Collapses to a single column below `lg`.
 */
export function SectionHeader({
  index,
  eyebrow,
  title,
  lede,
  className,
}: {
  index?: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-6 lg:grid-cols-12 lg:gap-8", className)}>
      <div className="lg:col-span-6">
        <p className="eyebrow flex items-center gap-3">
          {index ? <span className="mono-data text-mist">{index}</span> : null}
          <span>{eyebrow}</span>
        </p>
        <h2 className="display mt-4 text-balance text-3xl text-ink sm:text-4xl">{title}</h2>
      </div>
      {lede ? (
        <div className="lg:col-span-5 lg:col-start-8 lg:pt-9">
          <p className="text-base leading-relaxed text-graphite sm:text-lg">{lede}</p>
        </div>
      ) : null}
    </div>
  );
}
