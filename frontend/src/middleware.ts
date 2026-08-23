import { NextResponse, type NextRequest } from "next/server";
import { isAiCrawler } from "@/shared/core/ai-crawlers";

/**
 * Two jobs: enforce the AI-crawler policy that robots.txt states, and set the
 * security headers on every response.
 *
 * What this deliberately does NOT block:
 *   - Search engines. isAiCrawler lets a search crawler win any ambiguity,
 *     because delisting the real shop is far worse than serving one AI bot.
 *   - Generic HTTP clients (curl, node-fetch, python-requests, Go-http-client).
 *     Our own cron, uptime checks and any future webhook arrive as those, and
 *     blocking them stops fulfilment silently.
 *   - robots.txt itself, which stays readable to the crawlers being turned
 *     away so they can read the statement it carries.
 *
 * And a caveat worth keeping in the code: a user-agent rule cannot catch a
 * scraper that lies. The CDN's own AI-crawler toggle runs earlier, costs
 * nothing, and should also be enabled.
 */

const CSP = [
  "default-src 'self'",
  // Next injects inline bootstrap scripts; 'unsafe-inline' is required for
  // them and for the per-request public-env script.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // Product imagery is admin-managed and may live on any https host.
  "img-src 'self' https: data: blob:",
  "connect-src 'self' https:",
  "frame-src https://checkout.stripe.com",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

function securityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  // Two years, subdomains included — the value preload lists require.
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("Content-Security-Policy", CSP);
  response.headers.set("X-DNS-Prefetch-Control", "off");
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // robots.txt stays reachable to everyone, including the crawlers it turns
  // away — that is the whole point of putting a statement in it.
  if (pathname === "/robots.txt") {
    return securityHeaders(NextResponse.next());
  }

  if (isAiCrawler(request.headers.get("user-agent"))) {
    // 403 with no page content: refusing is the enforcement, and serving a
    // partial page would hand over exactly what the rule declines.
    return securityHeaders(
      new NextResponse(
        "This site asks AI training crawlers not to crawl it. See /robots.txt for the full statement.\n",
        { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      ) as NextResponse,
    );
  }

  return securityHeaders(NextResponse.next());
}

export const config = {
  // Everything except Next's own static output, which carries no content a
  // crawler wants and is served straight from the edge.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"],
};
