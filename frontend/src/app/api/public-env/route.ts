import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";

/**
 * Third fallback for the build-time inlining problem (see lib/env.ts). A page
 * that was statically prerendered carries whatever window.__APP_ENV held at
 * BUILD time, which on Workers may be nothing at all — this route is read at
 * request time and always tells the truth.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(publicEnv(), {
    headers: { "Cache-Control": "no-store" },
  });
}
