import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Long-form typography for the thesis. Only direct-child paragraphs are styled,
 * so figures and pull quotes placed between them keep their own type.
 */
export function Prose({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "[&>p]:mt-5 [&>p]:text-[1.0625rem] [&>p]:leading-[1.75] [&>p]:text-graphite [&>p:first-child]:mt-0",
        "[&_strong]:font-medium [&_strong]:text-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ArticleSection({
  id,
  index,
  title,
  children,
}: {
  id: string;
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 border-t border-line pt-10 sm:pt-12">
      <p className="mono-data text-xs text-mist">{index}</p>
      <h2 id={`${id}-heading`} className="display mt-3 text-balance text-2xl text-ink sm:text-3xl">
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function PullQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="display my-8 border-l border-ink pl-5 text-xl text-ink sm:text-2xl">
      {children}
    </blockquote>
  );
}
