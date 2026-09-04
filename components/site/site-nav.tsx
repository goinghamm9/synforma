import Link from "next/link";
import { SynformaLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui";
import { MobileMenu } from "./mobile-menu";
import { NAV_LINKS } from "./nav-links";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 sm:px-8">
        <Link href="/" aria-label="Synforma home" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40">
          <SynformaLogo />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-graphite transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          <Button asChild size="sm">
            <Link href="/demo">Run the demo</Link>
          </Button>
        </nav>
        <MobileMenu />
      </div>
    </header>
  );
}
