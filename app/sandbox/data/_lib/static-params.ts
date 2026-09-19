/**
 * Static route parameters for the sandbox (no "use client": these are read by
 * server-side `generateStaticParams`). The sandbox is client-rendered from
 * localStorage, so for static hosting every record route must exist as a
 * file; a generous range of ids is pre-generated and the client component
 * renders "not found" for ids that do not exist yet in the browser's data.
 */

export const PROJECT_IDS = ["PRJ-2001", "PRJ-2002"] as const;

/** TBL-4001 … TBL-4040: six seeded tables plus room for tables created later. */
export const TABLE_IDS: string[] = Array.from({ length: 40 }, (_, index) => `TBL-${4001 + index}`);

export function projectParams(): { projectId: string }[] {
  return PROJECT_IDS.map((projectId) => ({ projectId }));
}

export function tableParams(): { projectId: string; id: string }[] {
  return PROJECT_IDS.flatMap((projectId) => TABLE_IDS.map((id) => ({ projectId, id })));
}
