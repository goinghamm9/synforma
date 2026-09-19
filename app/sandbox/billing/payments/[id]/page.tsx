import { PAYMENT_PARAMS } from "../../_lib/static-ids";
import { PaymentDetailPage } from "./payment-detail";

/**
 * The sandbox is client-rendered from localStorage. For static hosting every
 * record route must exist as a file, so the seeded ids are pre-generated; the
 * client component renders "not found" for ids that do not exist.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return PAYMENT_PARAMS;
}

export default function Page() {
  return <PaymentDetailPage />;
}
