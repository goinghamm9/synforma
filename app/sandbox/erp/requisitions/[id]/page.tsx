import { RequisitionDetailPage } from "./requisition-detail";

/**
 * The sandbox is client-rendered from localStorage. For static hosting every
 * record route must exist as a file, so a generous range of ids is
 * pre-generated (PR-8001 … PR-8040); the client component renders "not found"
 * for ids that do not exist yet in the browser's data.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return Array.from({ length: 40 }, (_, index) => ({ id: `PR-${8001 + index}` }));
}

export default function Page() {
  return <RequisitionDetailPage />;
}
