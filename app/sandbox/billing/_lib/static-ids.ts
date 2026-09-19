/**
 * Record ids pre-generated for static export. The sandbox is client-rendered
 * from localStorage, so every record route must exist as a file: the seeded
 * ids plus a generous range for records created later. The client component
 * renders "not found" for ids that do not exist in the browser's data.
 *
 * This module has no "use client" directive so route files can call it from
 * `generateStaticParams`.
 */
function range(prefix: string, from: number, to: number): { id: string }[] {
  const out: { id: string }[] = [];
  for (let n = from; n <= to; n += 1) out.push({ id: `${prefix}-${n}` });
  return out;
}

export const CUSTOMER_PARAMS = range("CUS", 1001, 1010);
export const PAYMENT_PARAMS = range("PAY", 3001, 3020);
export const INVOICE_PARAMS = range("INV", 7001, 7030);
/** Seeded refunds sit just below RF-5001; new refunds are numbered RF-5001 upward. */
export const REFUND_PARAMS = range("RF", 4998, 5040);
