"use client";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { setUiVersion } from "../_lib/ui-version";

/**
 * Honors `?ui=v1|v2` on any sandbox route: writes the setting, then removes
 * the parameter from the URL (keeping any other query parameters).
 */
export function UiQuerySync() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const ui = params.get("ui");

  useEffect(() => {
    if (ui !== "v1" && ui !== "v2") return;
    setUiVersion(ui);
    const next = new URLSearchParams(params.toString());
    next.delete("ui");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [ui, params, pathname, router]);

  return null;
}
