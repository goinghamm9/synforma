import { OpportunityDetailPage } from "./opportunity-detail";

/**
 * The sandbox is client-rendered from localStorage. For static hosting every
 * record route must exist as a file, so a generous range of ids is
 * pre-generated; the client component renders "not found" for ids that do not
 * exist yet in the browser's data.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: "O-2001" }, { id: "O-2002" }, { id: "O-2003" }, { id: "O-2004" }, { id: "O-2005" }, { id: "O-2006" }, { id: "O-2007" }, { id: "O-2008" }, { id: "O-2009" }, { id: "O-2010" }, { id: "O-2011" }, { id: "O-2012" }, { id: "O-2013" }, { id: "O-2014" }, { id: "O-2015" }, { id: "O-2016" }, { id: "O-2017" }, { id: "O-2018" }, { id: "O-2019" }, { id: "O-2020" }, { id: "O-2021" }, { id: "O-2022" }, { id: "O-2023" }, { id: "O-2024" }, { id: "O-2025" }, { id: "O-2026" }, { id: "O-2027" }, { id: "O-2028" }, { id: "O-2029" }, { id: "O-2030" }, { id: "O-2031" }, { id: "O-2032" }, { id: "O-2033" }, { id: "O-2034" }, { id: "O-2035" }, { id: "O-2036" }, { id: "O-2037" }, { id: "O-2038" }, { id: "O-2039" }, { id: "O-2040" }, { id: "O-2041" }, { id: "O-2042" }, { id: "O-2043" }, { id: "O-2044" }, { id: "O-2045" }, { id: "O-2046" }, { id: "O-2047" }, { id: "O-2048" }, { id: "O-2049" }, { id: "O-2050" }, { id: "O-2051" }, { id: "O-2052" }, { id: "O-2053" }, { id: "O-2054" }, { id: "O-2055" }, { id: "O-2056" }, { id: "O-2057" }, { id: "O-2058" }, { id: "O-2059" }, { id: "O-2060" }];
}

export default function Page() {
  return <OpportunityDetailPage />;
}
