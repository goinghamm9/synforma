"use client";
import { useEffect } from "react";

/**
 * Sets `document.title` to "<title> · Lumen Workspace" and keeps it there:
 * the framework streams its own metadata `<title>` after hydration, which would
 * otherwise overwrite the value set on first load.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const full = title ? `${title} · Lumen Workspace` : "Lumen Workspace";
    const apply = () => {
      if (document.title !== full) document.title = full;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}
