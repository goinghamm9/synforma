import { tableParams } from "../../../../_lib/static-params";
import { TableDetailPage } from "./table-detail";

/**
 * The sandbox is client-rendered from localStorage. For static hosting every
 * record route must exist as a file, so a generous range of ids is
 * pre-generated (TBL-4001 … TBL-4040 per project); the client component
 * renders "not found" for ids that do not exist yet in the browser's data.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return tableParams();
}

export default function Page() {
  return <TableDetailPage />;
}
