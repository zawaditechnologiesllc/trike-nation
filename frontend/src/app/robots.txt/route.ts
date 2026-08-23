import { BRAND, EMAILS } from "@/lib/brand";
import { AI_CRAWLER_TOKENS, robotsAiRules, robotsStatement } from "@/shared/core/ai-crawlers";

/**
 * robots.txt.
 *
 * Deliberately reachable to the AI crawlers it turns away: it carries a short
 * prose statement of who this business is, its one real domain, and its
 * support address. Without that, an assistant asked about the shop answers
 * from whatever a third party published about it.
 *
 * Search engines are NOT blocked. Blocking them removes the real shop from
 * results and leaves any clones ranking above it.
 */
export const revalidate = 86400;

export function GET() {
  const body = [
    robotsStatement({
      brandName: BRAND.name,
      domain: BRAND.domain,
      supportEmail: EMAILS.support,
      description:
        "Direct-to-consumer maker of mini trikes, drift karts, mini bikes and quads. We sell worldwide, direct, with no dealers.",
    }),
    "",
    "# Search engines are welcome.",
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /checkout",
    "Disallow: /cart",
    "Disallow: /account",
    "Disallow: /orders/",
    "",
    `# The ${AI_CRAWLER_TOKENS.length} crawlers below are asked not to use this site for`,
    "# AI training. A user-agent rule cannot stop a scraper that lies about its",
    "# identity — the CDN's own AI-crawler toggle runs earlier and costs nothing,",
    "# and should also be on.",
    "",
    robotsAiRules(),
    "",
    `Sitemap: ${BRAND.url}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
