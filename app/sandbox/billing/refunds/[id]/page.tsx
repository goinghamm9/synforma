import { REFUND_PARAMS } from "../../_lib/static-ids";
import { RefundDetailPage } from "./refund-detail";

/**
 * The sandbox is client-rendered from localStorage. For static hosting every
 * record route must exist as a file, so a generous range of ids is
 * pre-generated (seeded refunds plus RF-5001 upward for refunds issued later);
 * the client component renders "not found" for ids that do not exist yet.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return REFUND_PARAMS;
}

export default function Page() {
  return <RefundDetailPage />;
}
