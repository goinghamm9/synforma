/**
 * Static route parameters for the sandbox (no "use client": these are read by
 * server-side `generateStaticParams`). The sandbox is client-rendered from
 * localStorage, so for static hosting every record route must exist as a
 * file; a generous range of ids is pre-generated and the client component
 * renders "not found" for ids that do not exist yet in the browser's data.
 */

/** PRJ-1001 … PRJ-1040: six seeded projects plus room for projects created later. */
export const PROJECT_IDS: string[] = Array.from({ length: 40 }, (_, index) => `PRJ-${1001 + index}`);

export function projectParams(): { id: string }[] {
  return PROJECT_IDS.map((id) => ({ id }));
}
