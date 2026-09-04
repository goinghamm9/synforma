import { NextResponse } from "next/server";
import { describeProvider } from "@/lib/synforma/planner/server";

/**
 * GET /api/planner/status → { configured, provider, model? }
 * Reveals only whether a provider is configured and which model it uses.
 * The key never leaves the server.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(describeProvider(), { headers: { "Cache-Control": "no-store" } });
}
