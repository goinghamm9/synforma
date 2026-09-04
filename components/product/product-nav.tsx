"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SynformaLogo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/demo", label: "Mission Control" },
  { href: "/employee", label: "Employee view" },
  { href: "/graph", label: "Work Graph" },
  { href: "/science", label: "Science" },
  { href: "/settings", label: "Settings" },
];

export function ProductNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="Synforma home">
          <SynformaLogo />
        </Link>
        <nav aria-label="Product" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-thin">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  active ? "bg-ink text-paper" : "text-graphite hover:bg-surface-2 hover:text-ink",
                )}
                aria-current={active ? "page" : undefined}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/sandbox/crm" target="_blank" rel="noreferrer" className="hidden text-[12px] text-slate hover:text-ink sm:block">
          Open Meridian CRM ↗
        </Link>
      </div>
    </header>
  );
}
