import { SupplierDetailPage } from "./supplier-detail";

/**
 * The sandbox is client-rendered from localStorage. For static hosting every
 * record route must exist as a file (SUP-1001 … SUP-1010); the client
 * component renders "not found" for ids that do not exist in the browser's data.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return Array.from({ length: 10 }, (_, index) => ({ id: `SUP-${1001 + index}` }));
}

export default function Page() {
  return <SupplierDetailPage />;
}
