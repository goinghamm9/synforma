import { PAYMENT_PARAMS } from "../../../_lib/static-ids";
import { RefundPage } from "./refund-page";

/** Pre-generated for static hosting; see the payment detail route. */
export const dynamicParams = false;

export function generateStaticParams() {
  return PAYMENT_PARAMS;
}

export default function Page() {
  return <RefundPage />;
}
