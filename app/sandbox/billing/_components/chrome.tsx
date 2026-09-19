"use client";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, CreditCard, FileText, Home, Settings, ShieldAlert, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENT_USER } from "../_lib/db";
import { useUi, type NavKey } from "../_lib/ui-version";
import { UiQuerySync } from "./ui-query-sync";
import s from "../billing.module.css";

const NAV_ICONS: Record<NavKey, typeof Home> = {
  home: Home,
  customers: Users,
  payments: CreditCard,
  invoices: FileText,
  refunds: ArrowLeftRight,
  disputes: ShieldAlert,
  settings: Settings,
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/sandbox/billing") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BillingChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { nav, version, versionLabel } = useUi();

  return (
    <div className={s.root}>
      <Suspense fallback={null}>
        <UiQuerySync />
      </Suspense>
      <header className={s.header}>
        <div className="flex h-12 items-center justify-between gap-4 px-4 sm:px-5">
          <Link href="/sandbox/billing" className={s.brand}>
            <span className={s.brandMark} aria-hidden="true">
              L
            </span>
            Ledgerline Billing
            <span className={s.brandTag}>{versionLabel}</span>
          </Link>
          <div className={s.userChip}>
            <span className={s.avatar} aria-hidden="true">
              {CURRENT_USER.initials}
            </span>
            <span>
              <span className="hidden sm:inline">Signed in as </span>
              <span className={s.userName}>{CURRENT_USER.name}</span>
              <span className="hidden md:inline"> · {CURRENT_USER.role}</span>
            </span>
          </div>
        </div>
      </header>
      <div className={s.shell}>
        <aside className={s.sidebar}>
          <nav aria-label="Primary" className={s.sideNav} data-ui={version}>
            {nav.map((entry) => {
              if (entry.kind === "group") {
                return (
                  <div key={entry.key} className={s.navGroup} role="presentation">
                    {entry.label}
                  </div>
                );
              }
              const active = isActive(pathname, entry.href);
              const Icon = NAV_ICONS[entry.key];
              return (
                <Link key={entry.key} href={entry.href} className={cn(s.navLink, active && s.navLinkActive)} aria-current={active ? "page" : undefined}>
                  <Icon size={16} aria-hidden="true" className={s.navIcon} />
                  {entry.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className={cn(s.main, "flex flex-col")}>
          <main id="content" className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-5 sm:px-6">
            {children}
          </main>
          <footer className={cn(s.footer, "mt-8")}>
            <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
              <span>Replica of a billing-dashboard pattern built for demonstration. Not affiliated with any vendor.</span>
              <span>Data is stored in this browser only</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
