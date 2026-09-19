"use client";
import { Suspense } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CURRENT_USER } from "../_lib/db";
import { useUi } from "../_lib/ui-version";
import { UiQuerySync } from "./ui-query-sync";
import s from "../erp.module.css";

export function ErpChrome({ children }: { children: React.ReactNode }) {
  const { labels } = useUi();

  return (
    <div className={s.root}>
      <Suspense fallback={null}>
        <UiQuerySync />
      </Suspense>
      <header className={s.shell}>
        <div className="mx-auto flex h-12 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/sandbox/erp" className={s.brand} aria-label="Atlas ERP home">
            <span className={s.brandMark} aria-hidden="true">
              A
            </span>
            <span>Atlas ERP</span>
            <span className={s.brandTag}>{labels.release}</span>
          </Link>
          <div className={s.userChip}>
            <span className="hidden sm:inline">Signed in as </span>
            <span className={s.userName}>{CURRENT_USER.name}</span>
            <span className="hidden md:inline"> · {CURRENT_USER.role}</span>
            <span className={s.avatar} aria-hidden="true">
              {CURRENT_USER.initials}
            </span>
          </div>
        </div>
      </header>
      <main id="content" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-5 sm:px-6">
        {children}
      </main>
      <footer className={cn(s.footer, "mt-8 bg-white")}>
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <span>Replica of an enterprise-ERP pattern built for demonstration. Not affiliated with any vendor.</span>
          <span>
            Atlas ERP {labels.release} · Data is stored in this browser only
          </span>
        </div>
      </footer>
    </div>
  );
}
