import { INVOICE_PARAMS } from "../../_lib/static-ids";
import { InvoiceDetailPage } from "./invoice-detail";

/**
 * The sandbox is client-rendered from localStorage. For static hosting every
 * record route must exist as a file, so the seeded ids are pre-generated; the
 * client component renders "not found" for ids that do not exist.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return INVOICE_PARAMS;
}

export default function Page() {
  return <InvoiceDetailPage />;
}
