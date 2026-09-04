"use client";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CURRENT_USER } from "../_lib/db";
import { useUi } from "../_lib/ui-version";
import { UiQuerySync } from "./ui-query-sync";
import s from "../crm.module.css";

function isActive(pathname: string, href: string): boolean {
  if (href === "/sandbox/crm") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CrmChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { nav, version } = useUi();

  return (
    <div className={s.root}>
      <Suspense fallback={null}>
        <UiQuerySync />
      </Suspense>
      <header className={s.header}>
        <div className="mx-auto flex max-w-[1200px] flex-col px-4 sm:px-6">
          <div className="flex h-12 items-center justify-between gap-4">
            <Link href="/sandbox/crm" className={s.brand}>
              Meridian CRM
              <span className={s.brandTag}>{version === "v2" ? "v4.3 preview" : "v4.2"}</span>
            </Link>
            <div className={s.userChip}>
              <span className="hidden sm:inline">Signed in as </span>
              <span className={s.userName}>{CURRENT_USER.name}</span>
              <span className="hidden md:inline"> · {CURRENT_USER.role}</span>
            </div>
          </div>
          <nav aria-label="Primary" className="-mx-2 flex overflow-x-auto">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(s.navLink, active && s.navLinkActive)}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main id="content" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-5 sm:px-6">
        {children}
      </main>
      <footer className={cn(s.footer, "mt-8 bg-white")}>
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <span>Meridian CRM v4.2 · Sandbox environment</span>
          <span>Data is stored in this browser only</span>
        </div>
      </footer>
    </div>
  );
}
