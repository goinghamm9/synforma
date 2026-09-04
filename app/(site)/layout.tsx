import type { ReactNode } from "react";
import { MotionProvider } from "@/components/site/motion-provider";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-paper"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </MotionProvider>
  );
}
