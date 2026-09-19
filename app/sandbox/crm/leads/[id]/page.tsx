import { LeadDetailPage } from "./lead-detail";

/**
 * The sandbox is client-rendered from localStorage. For static hosting every
 * record route must exist as a file, so a generous range of ids is
 * pre-generated; the client component renders "not found" for ids that do not
 * exist yet in the browser's data.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: "L-1001" }, { id: "L-1002" }, { id: "L-1003" }, { id: "L-1004" }, { id: "L-1005" }, { id: "L-1006" }, { id: "L-1007" }, { id: "L-1008" }, { id: "L-1009" }, { id: "L-1010" }, { id: "L-1011" }, { id: "L-1012" }, { id: "L-1013" }, { id: "L-1014" }, { id: "L-1015" }, { id: "L-1016" }, { id: "L-1017" }, { id: "L-1018" }, { id: "L-1019" }, { id: "L-1020" }];
}

export default function Page() {
  return <LeadDetailPage />;
}
