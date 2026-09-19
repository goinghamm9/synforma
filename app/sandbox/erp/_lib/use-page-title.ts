"use client";
import { useEffect } from "react";

/**
 * Sets `document.title` to "<title> · Atlas ERP". Streamed route metadata can
 * commit its own <title> after this effect has run, so the value is re-applied
 * whenever the document head changes (only when it differs, so no loop).
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const wanted = title ? `${title} · Atlas ERP` : "Atlas ERP";
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}
