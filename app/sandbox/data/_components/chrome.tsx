"use client";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import {
  Check,
  ChevronDown,
  Database,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Table2,
  Terminal,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENT_USER, DEFAULT_PROJECT_ID, initials, useDb } from "../_lib/db";
import { navFor, projectPath, useUi, type NavKey } from "../_lib/ui-version";
import { UiQuerySync } from "./ui-query-sync";
import s from "../data.module.css";

const ICONS: Record<NavKey, typeof Table2> = {
  home: LayoutDashboard,
  tables: Table2,
  sql: Terminal,
  auth: ShieldCheck,
  storage: HardDrive,
  apiKeys: KeyRound,
  team: Users,
  settings: Settings,
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/sandbox/data") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The project id in the current URL, or the default project. */
export function projectIdFromPath(pathname: string): string {
  const match = /\/sandbox\/data\/projects\/([^/]+)/.exec(pathname);
  return match ? match[1] : DEFAULT_PROJECT_ID;
}

function ProjectSelector({ projectId }: { projectId: string }) {
  const db = useDb();
  const router = useRouter();
  const projects = db?.projects ?? [{ id: DEFAULT_PROJECT_ID, name: "Acme Ops" }];
  const current = projects.find((p) => p.id === projectId);
  const label = current ? `${current.name} (${current.id})` : projectId;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={s.projectBtn} title="Switch project">
          <span className={s.projectDot} aria-hidden="true" />
          <span className={s.projectLabel}>{label}</span>
          <ChevronDown size={14} aria-hidden="true" className={s.muted} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={s.menuContent} align="start" sideOffset={4}>
          <DropdownMenu.Label className={s.menuLabel}>Projects</DropdownMenu.Label>
          {projects.map((project) => (
            <DropdownMenu.Item key={project.id} className={s.menuItem} onSelect={() => router.push(projectPath(project.id, "/tables"))}>
              {project.id === projectId ? <Check size={14} aria-hidden="true" /> : <span className="inline-block w-3.5" aria-hidden="true" />}
              {project.name} ({project.id})
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className={s.menuSeparator} />
          <DropdownMenu.Item className={s.menuItem} disabled>
            New project (not available in this demo)
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function DataChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { version, productVersion } = useUi();
  const projectId = projectIdFromPath(pathname);
  const nav = navFor(version, projectId);
  const projectItems = nav.filter((item) => item.scope === "project");
  const globalItems = nav.filter((item) => item.scope === "global");

  const renderLink = (item: (typeof nav)[number]) => {
    const active = isActive(pathname, item.href);
    const Icon = ICONS[item.key];
    return (
      <Link key={item.key} href={item.href} className={cn(s.sideLink, active && s.sideLinkActive)} aria-current={active ? "page" : undefined}>
        <Icon size={16} aria-hidden="true" className={s.sideIcon} />
        {item.label}
      </Link>
    );
  };

  return (
    <div className={s.root}>
      <Suspense fallback={null}>
        <UiQuerySync />
      </Suspense>
      <aside className={s.sidebar}>
        <Link href="/sandbox/data" className={s.sideBrand}>
          <span className={s.sideMark}>
            <Database size={16} aria-hidden="true" />
          </span>
          <span>
            <span className={s.sideBrandName}>Nimbus</span>
            <span className={s.sideBrandSub}>Data Console</span>
          </span>
        </Link>
        <nav aria-label="Primary" className={s.sideNav}>
          {globalItems.filter((item) => item.key === "home").map(renderLink)}
          <span className={s.sideSection} aria-hidden="true">
            Project
          </span>
          {projectItems.map(renderLink)}
          <span className={s.sideSpacer} aria-hidden="true" />
          {globalItems.filter((item) => item.key !== "home").map(renderLink)}
        </nav>
      </aside>
      <div className={s.frame}>
        <header className={s.topbar}>
          <ProjectSelector projectId={projectId} />
          <span className={s.versionTag} title="Console version">
            {productVersion}
          </span>
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
            <span>Replica of a developer-console pattern built for demonstration. Not affiliated with any vendor.</span>
            <span>Nimbus Data Console {productVersion} · Data is stored in this browser only</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
