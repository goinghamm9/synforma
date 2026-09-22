import { NextResponse } from "next/server";
import { describeDecisionProvider, probeDecisionProvider } from "@/lib/synforma/decisions/server";

/**
 * GET /api/decide/status → { configured, provider, model?, via? }
 * With ?probe=1 the server also asks the model one fixed question and reports
 * whether a usable answer came back, how fast, and over which request form.
 * Reveals nothing else; the credentials never leave the server.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 6_000;

export async function GET(request: Request) {
  const status = describeDecisionProvider();
  const probe = new URL(request.url).searchParams.get("probe");
  if (probe === "1" || probe === "true") {
    return NextResponse.json({ ...status, probe: await probeDecisionProvider(AbortSignal.timeout(PROBE_TIMEOUT_MS)) }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
