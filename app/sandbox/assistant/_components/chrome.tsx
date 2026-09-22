"use client";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, FolderKanban, LayoutDashboard, Settings, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENT_USER, WORKSPACE_NAME, initials } from "../_lib/db";
import { BASE_PATH, navFor, useUi, type NavKey } from "../_lib/ui-version";
import { UiQuerySync } from "./ui-query-sync";
import s from "../assistant.module.css";

const ICONS: Record<NavKey, typeof FolderKanban> = {
  home: LayoutDashboard,
  projects: FolderKanban,
  knowledge: BookOpen,
  usage: BarChart3,
  members: Users,
  settings: Settings,
};

function isActive(pathname: string, href: string): boolean {
  if (href === BASE_PATH) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function LumenChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { version, productVersion } = useUi();
  const nav = navFor(version);

  return (
    <div className={s.root}>
      <Suspense fallback={null}>
        <UiQuerySync />
      </Suspense>
      <aside className={s.sidebar}>
        <Link href={BASE_PATH} className={s.sideBrand}>
          <span className={s.sideMark}>
            <Sparkles size={16} aria-hidden="true" />
          </span>
          <span>
            <span className={s.sideBrandName}>Lumen</span>
            <span className={s.sideBrandSub}>Workspace</span>
          </span>
        </Link>
        <nav aria-label="Primary" className={s.sideNav}>
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = ICONS[item.key];
            return (
              <Link key={item.key} href={item.href} className={cn(s.sideLink, active && s.sideLinkActive)} aria-current={active ? "page" : undefined}>
                <Icon size={16} aria-hidden="true" className={s.sideIcon} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <span className={s.sideSpacer} aria-hidden="true" />
        <p className={cn(s.sideNote, "m-0")}>Approved instruction templates are maintained by the AI governance team.</p>
      </aside>
      <div className={s.frame}>
        <header className={s.topbar}>
          <span className={s.productName}>Lumen Workspace</span>
          <span className={s.versionTag} title="Product version">
            {productVersion}
          </span>
          <span className={s.workspaceChip}>{WORKSPACE_NAME}</span>
          <div className={s.userChip}>
            <span className={s.avatar} aria-hidden="true">
              {initials(CURRENT_USER.name)}
            </span>
            <span>
              <span className="hidden sm:inline">Signed in as </span>
              <span className={s.userName}>{CURRENT_USER.name}</span>
              <span className="hidden md:inline"> · {CURRENT_USER.role}</span>
            </span>
          </div>
        </header>
        <main id="content" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-5 sm:px-6">
          {children}
        </main>
        <footer className={cn(s.footer, "mt-8")}>
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
            <span>Fictional replica of an enterprise AI-assistant workspace pattern, built for this demonstration; not affiliated with any vendor.</span>
            <span>Lumen Workspace {productVersion} · Data is stored in this browser only</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
