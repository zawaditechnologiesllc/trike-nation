import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPlaceholder,
  organizationJsonLd,
  productJsonLd,
  trustChecklist,
  websiteJsonLd,
} from "../../shared/core/trust";
import { isAiCrawler, AI_CRAWLER_TOKENS, SEARCH_CRAWLERS_NEVER_BLOCK, GENERIC_CLIENTS_NEVER_BLOCK } from "../../shared/core/ai-crawlers";

const store = {
  name: "Go Cart Grip",
  legalName: "Go Cart Grip",
  url: "https://gocartgrip.shop",
  description: "Mini trikes, drift karts, mini bikes and quads.",
  email: "support@gocartgrip.shop",
  phone: "+1 (916) 436-8303",
  address: "4821 Throttle Way, Sacramento, CA 95814",
  social: { facebook: "https://facebook.com/gocartgrip" },
};

test("a placeholder address is OMITTED rather than published", () => {
  // A fictional address a checker follows and cannot find scores LOWER than
  // no address at all.
  const markup = organizationJsonLd(store);
  assert.equal(markup.address, undefined, "the seeded default address must not be published");
});

test("a real address IS published", () => {
  const markup = organizationJsonLd({ ...store, address: "17 Oakfield Industrial Park, Leeds LS11 5RD" });
  assert.ok(markup.address, "a genuine address must reach the markup");
});

test("555 numbers and example.com are treated as placeholders", () => {
  assert.ok(isPlaceholder("+1 555 123 4567"));
  assert.ok(isPlaceholder("hello@example.com"));
  assert.ok(isPlaceholder("  "));
  assert.ok(isPlaceholder("TBD"));
  assert.ok(!isPlaceholder("support@gocartgrip.shop"));
});

test("NEVER emits aggregateRating or review markup", () => {
  // The commonest cause of a structured-data manual action, and the penalty
  // lands on the whole domain.
  const markup = JSON.stringify(
    productJsonLd(
      { name: "Venom V3", slug: "venom-v3", description: "d", priceCents: 189900, currency: "usd", inStock: true },
      store,
    ),
  );
  assert.ok(!markup.includes("aggregateRating"), "aggregateRating must never appear");
  assert.ok(!markup.toLowerCase().includes('"review"'), "review markup must never appear");
});

test("the offer carries the REAL price and the REAL stock", () => {
  // Markup that disagrees with the page is itself a penalty.
  const markup = productJsonLd(
    { name: "Venom V3", slug: "venom-v3", description: "d", priceCents: 189900, currency: "usd", inStock: false },
    store,
  );
  const offer = markup.offers as Record<string, string>;
  assert.equal(offer.price, "1899.00");
  assert.equal(offer.availability, "https://schema.org/OutOfStock");
});

test("sameAs is an ARRAY, not an object with numeric keys", () => {
  // {"0": "https://…"} is valid JSON and silently ignored by every consumer
  // that expects a list — which is all of them.
  const markup = organizationJsonLd({
    ...store,
    social: { facebook: "https://facebook.com/gocartgrip", instagram: "https://instagram.com/gocartgrip" },
  });
  assert.ok(Array.isArray(markup.sameAs), `sameAs must be an array, got ${JSON.stringify(markup.sameAs)}`);
  assert.equal((markup.sameAs as string[]).length, 2);
});

test("placeholder social links are dropped without collapsing the array", () => {
  const markup = organizationJsonLd({
    ...store,
    social: { facebook: "https://facebook.com/gocartgrip", instagram: "https://example.com/x" },
  });
  assert.deepEqual(markup.sameAs, ["https://facebook.com/gocartgrip"]);
});

test("no empty PostalAddress husk is published when the address is a placeholder", () => {
  // Dropping the street but publishing an empty node is the same problem in
  // miniature: a detail a checker follows and cannot resolve.
  const markup = organizationJsonLd(store);
  assert.equal(markup.address, undefined);
  assert.ok(!JSON.stringify(markup).includes("PostalAddress"));
});

test("the checklist names the CONSEQUENCE, not just the missing field", () => {
  const issues = trustChecklist(store);
  assert.ok(issues.length > 0);
  for (const issue of issues) {
    assert.ok(issue.whyItMatters.length > 40, `${issue.field} needs a reason an owner will act on`);
  }
});

test("the website markup points search at the real search page", () => {
  const markup = websiteJsonLd(store) as Record<string, Record<string, Record<string, string>>>;
  assert.match(markup.potentialAction.target.urlTemplate, /^https:\/\/gocartgrip\.shop\/search/);
});

test("named AI training crawlers are recognised", () => {
  for (const token of AI_CRAWLER_TOKENS) {
    assert.ok(isAiCrawler(`Mozilla/5.0 (compatible; ${token}/1.0)`), `${token} not recognised`);
  }
});

test("search engines are NEVER blocked", () => {
  // Blocking these removes the real shop from results and leaves any clones.
  for (const token of SEARCH_CRAWLERS_NEVER_BLOCK) {
    assert.equal(isAiCrawler(`Mozilla/5.0 (compatible; ${token}/2.1)`), false, `${token} must not be blocked`);
  }
});

test("generic HTTP clients are NEVER blocked", () => {
  // Our own cron, health checks and webhooks arrive as these; blocking them
  // stops fulfilment silently.
  for (const token of GENERIC_CLIENTS_NEVER_BLOCK) {
    assert.equal(isAiCrawler(`${token}/8.4.0`), false, `${token} must not be blocked`);
  }
});

test("an ordinary browser is never blocked", () => {
  assert.equal(
    isAiCrawler("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"),
    false,
  );
  assert.equal(isAiCrawler(null), false);
  assert.equal(isAiCrawler(""), false);
});

test("Applebot is served while Applebot-Extended is turned away", () => {
  // The pair that catches a naive substring match: one is a search crawler,
  // the other is the training opt-out token.
  assert.equal(isAiCrawler("Mozilla/5.0 (compatible; Applebot/0.1)"), false);
  assert.ok(AI_CRAWLER_TOKENS.includes("Applebot-Extended"));
});
