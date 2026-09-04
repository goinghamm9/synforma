import Link from "next/link";
import { SynformaLogo } from "@/components/brand/logo";
import { Container } from "./section";
import { FOOTER_LINKS } from "./nav-links";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-2/50">
      <Container className="py-14 sm:py-16">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-6">
            <SynformaLogo />
            <p className="mt-4 text-sm text-graphite">Intelligence for becoming.</p>
            <p className="mt-1 text-xs text-slate">Pronounced sin-FOR-ma.</p>
          </div>
          <nav aria-label="Footer" className="md:col-span-6">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-graphite transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-xs text-slate sm:flex-row sm:items-center sm:justify-between">
          <p>Synforma is a working brand name pending trademark and domain clearance.</p>
          <p className="mono-data">Autonomous Digital Adoption</p>
        </div>
      </Container>
    </footer>
  );
}
