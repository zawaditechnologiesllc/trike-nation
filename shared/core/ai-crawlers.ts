/**
 * AI training crawlers we turn away.
 *
 * ONE list, read by robots.txt and by the middleware that enforces it. Two
 * copies drift, and a token in robots.txt but not the middleware is a policy
 * that only politely-behaved crawlers honour.
 *
 * Three things this deliberately does NOT do:
 *   - It does not block search engines. Blocking Googlebot removes the real
 *     shop from results and leaves whatever clones exist ranking above it.
 *   - It does not block generic HTTP clients (curl, node-fetch,
 *     python-requests, Go-http-client). Our own cron and health checks arrive
 *     as those; blocking them stops fulfilment silently.
 *   - It does not pretend to be complete. A scraper that lies about its
 *     user-agent walks straight through a user-agent rule. The CDN's own
 *     AI-crawler toggle runs earlier, costs nothing, and should also be on.
 */

export const AI_CRAWLER_TOKENS = [
  "AI2Bot", "Ai2Bot-Dolma", "Amazonbot", "anthropic-ai", "Applebot-Extended",
  "Bytespider", "CCBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User",
  "Claude-Web", "ClaudeBot", "cohere-ai", "cohere-training-data-crawler",
  "Crawlspace", "Diffbot", "DuckAssistBot", "FacebookBot", "FriendlyCrawler",
  "Google-CloudVertexBot", "Google-Extended", "GoogleOther", "GoogleOther-Image",
  "GoogleOther-Video", "GPTBot", "iaskspider/2.0", "ICC-Crawler",
  "ImagesiftBot", "img2dataset", "ISSCyberRiskCrawler", "Kangaroo Bot",
  "Meta-ExternalAgent", "Meta-ExternalFetcher", "OAI-SearchBot", "omgili",
  "omgilibot", "PanguBot", "peer39_crawler", "PerplexityBot",
  "Perplexity-User", "PetalBot", "Scrapy", "SemrushBot-OCOB",
  "SemrushBot-SWA", "Sidetrade indexer bot", "Timpibot", "VelenPublicWebCrawler",
  "Webzio-Extended", "YouBot",
] as const;

/**
 * Search crawlers, listed only so nobody "tidies up" by adding them above.
 * Blocking these is the single most expensive mistake available here.
 */
export const SEARCH_CRAWLERS_NEVER_BLOCK = [
  "Googlebot", "Bingbot", "DuckDuckBot", "Slurp", "Baiduspider",
  "YandexBot", "Applebot", "facebookexternalhit", "Twitterbot", "LinkedInBot",
] as const;

/**
 * Generic HTTP clients, listed for the same reason: our own webhooks, cron and
 * uptime checks arrive as these.
 */
export const GENERIC_CLIENTS_NEVER_BLOCK = [
  "curl", "wget", "node-fetch", "undici", "python-requests", "Go-http-client",
  "axios", "okhttp", "PostmanRuntime",
] as const;

const LOWER_TOKENS = AI_CRAWLER_TOKENS.map((t) => t.toLowerCase());
const LOWER_SEARCH = SEARCH_CRAWLERS_NEVER_BLOCK.map((t) => t.toLowerCase());

function longestMatch(userAgent: string, tokens: string[]): number {
  let longest = 0;
  for (const token of tokens) {
    if (userAgent.includes(token) && token.length > longest) longest = token.length;
  }
  return longest;
}

/**
 * True when this user-agent is one of the named AI training crawlers.
 *
 * Matching is LONGEST-WINS rather than "search always wins", because the two
 * lists overlap by design: "Applebot" is a search crawler and
 * "Applebot-Extended" is Apple's AI-training token, and a plain substring
 * check lets the shorter one shadow the longer one. On a genuine tie the
 * search list wins — serving one AI crawler is far cheaper than delisting the
 * shop.
 */
export function isAiCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  const ai = longestMatch(ua, LOWER_TOKENS);
  if (ai === 0) return false;
  return ai > longestMatch(ua, LOWER_SEARCH);
}

/**
 * The prose statement carried in robots.txt itself.
 *
 * robots.txt stays reachable to the very crawlers being turned away, on
 * purpose: if nothing is available, an assistant asked about this shop answers
 * from whatever a third party published about it.
 */
export function robotsStatement(input: {
  brandName: string;
  domain: string;
  supportEmail: string;
  description: string;
}): string {
  return [
    `# ${input.brandName}`,
    `#`,
    `# ${input.description}`,
    `#`,
    `# The only official website is https://${input.domain}`,
    `# The only official support address is ${input.supportEmail}`,
    `# Any other domain or address claiming to be ${input.brandName} is not us.`,
    `#`,
    `# AI training crawlers are asked not to crawl this site (rules below).`,
    `# Search engine crawlers are welcome.`,
  ].join("\n");
}

/** The Disallow blocks, in robots.txt syntax. */
export function robotsAiRules(): string {
  return AI_CRAWLER_TOKENS.map((token) => `User-agent: ${token}\nDisallow: /`).join("\n\n");
}
