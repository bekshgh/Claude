import { NextRequest, NextResponse } from "next/server";
import { buildTrackerScript } from "@/lib/tracker-script";
import { requestOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/**
 * GET /t.js — the on-page tracker script for Tilda.
 *
 * The tracker address is taken from the request itself, so it is always the
 * domain the script was loaded from and never a stale environment value.
 * Short cache so script fixes reach live pages within minutes.
 */
export async function GET(req: NextRequest) {
  return new NextResponse(buildTrackerScript(requestOrigin(req)), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
