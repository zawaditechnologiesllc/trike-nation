/**
 * Structured data, and the guard that keeps it honest.
 *
 * A brand-new domain scores badly on trust checkers, and the fix is real
 * signals rather than clever ones. The single most damaging thing available
 * here is publishing a value that is still a shipped default: a checker that
 * follows a fictional address and cannot find it scores LOWER than one that
 * finds no address at all.
 *
 * So every field passes through `isPlaceholder` and is omitted rather than
 * published when it is still a default.
 *
 * Deliberately absent, and it must stay that way: aggregateRating and Review
 * markup. Marking up reviews that do not exist is the commonest cause of a
 * structured-data manual action, and the penalty lands on the whole domain.
 */

/** Values shipped as defaults that must never reach structured data. */
const PLACEHOLDER_PATTERNS = [
  /^$/,
  /your[- ]?(company|business|store|brand)/i,
  /example\.(com|org|net)/i,
  /\b(lorem|ipsum)\b/i,
  /^(tbd|tba|n\/?a|none|null|undefined|placeholder|change ?me|todo)$/i,
  /^\+?1?[\s(-]*555[\s)-]/, // 555 numbers are fictional by convention
  /123[- ]?4567/,
  /^123 /,
  /\b(main st(reet)?|any ?street|somewhere)\b/i,
  // The values this repository itself ships as seed data.
  /4821 Throttle Way/i,
];

export function isPlaceholder(value: string | null | undefined): boolean {
  const text = (value ?? "").trim();
  if (!text) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

/** Drops every key whose value is missing or still a placeholder. */
function omitPlaceholders<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      if (!isPlaceholder(value)) out[key] = value;
    } else if (Array.isArray(value)) {
      // Arrays must stay arrays. Rebuilding one as a plain object turns
      // sameAs into {"0": "..."} — syntactically fine, and silently ignored
      // by every consumer that expects a list.
      const kept = value.filter((item) => (typeof item === "string" ? !isPlaceholder(item) : item != null));
      if (kept.length > 0) out[key] = kept;
    } else if (value && typeof value === "object") {
      const nested = omitPlaceholders(value as Record<string, unknown>);
      // A node whose only surviving key is "@type" is a husk: dropping the
      // street address but publishing an empty PostalAddress is exactly the
      // "fictional detail a checker follows" problem in a smaller form.
      const meaningful = Object.keys(nested).filter((k) => k !== "@type");
      if (meaningful.length > 0) out[key] = nested;
    } else if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out as Partial<T>;
}

export interface StoreIdentity {
  name: string;
  legalName?: string | null;
  url: string;
  logoUrl?: string | null;
  description: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  social?: Record<string, string | undefined>;
}

/**
 * Organization / OnlineStore markup, built from the SAME settings the footer
 * renders — so the name, address and phone can never disagree across the site.
 */
export function organizationJsonLd(store: StoreIdentity): Record<string, unknown> {
  const sameAs = Object.values(store.social ?? {}).filter(
    (url): url is string => Boolean(url) && !isPlaceholder(url),
  );
  return omitPlaceholders({
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: store.name,
    legalName: store.legalName ?? undefined,
    url: store.url,
    logo: store.logoUrl ?? undefined,
    description: store.description,
    email: store.email ?? undefined,
    telephone: store.phone ?? undefined,
    address: store.address
      ? { "@type": "PostalAddress", streetAddress: store.address }
      : undefined,
    contactPoint: store.email
      ? {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: store.email,
          telephone: store.phone ?? undefined,
        }
      : undefined,
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }) as Record<string, unknown>;
}

export function websiteJsonLd(store: StoreIdentity): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: store.name,
    url: store.url,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${store.url}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export interface ProductForMarkup {
  name: string;
  slug: string;
  description: string;
  image?: string | null;
  priceCents: number;
  currency: string;
  inStock: boolean;
  sku?: string | null;
  colors?: { name: string }[];
}

/**
 * Product + Offer, with the REAL price and the REAL stock. Markup that
 * disagrees with the page is itself a penalty.
 */
export function productJsonLd(product: ProductForMarkup, store: StoreIdentity): Record<string, unknown> {
  return omitPlaceholders({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.image ?? undefined,
    sku: product.sku ?? product.slug,
    brand: { "@type": "Brand", name: store.name },
    ...(product.colors?.length ? { color: product.colors.map((c) => c.name).join(", ") } : {}),
    offers: {
      "@type": "Offer",
      url: `${store.url}/products/${product.slug}`,
      priceCurrency: product.currency.toUpperCase(),
      price: (product.priceCents / 100).toFixed(2),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: store.name },
    },
    // No aggregateRating and no review: see the note at the top of this file.
  }) as Record<string, unknown>;
}

export interface TrustIssue {
  field: string;
  severity: "high" | "medium" | "low";
  detail: string;
  whyItMatters: string;
}

/**
 * The admin trust checklist: what is still a placeholder, and why a checker
 * cares. Naming the consequence is the difference between a list somebody
 * fixes and a list somebody ignores.
 */
export function trustChecklist(store: StoreIdentity): TrustIssue[] {
  const issues: TrustIssue[] = [];

  if (isPlaceholder(store.address)) {
    issues.push({
      field: "Business address",
      severity: "high",
      detail: "Still the shipped default, so it is omitted from structured data.",
      whyItMatters:
        "A fictional address that a trust checker follows and cannot find scores LOWER than no address at all. Publishing the real one is the single biggest signal a new domain can add.",
    });
  }
  if (isPlaceholder(store.phone)) {
    issues.push({
      field: "Phone number",
      severity: "high",
      detail: "Still a placeholder or a 555 number, so it is omitted.",
      whyItMatters: "A number that resolves to a real business is checked by both customers and rating services.",
    });
  }
  if (isPlaceholder(store.email)) {
    issues.push({
      field: "Support email",
      severity: "high",
      detail: "Missing or still a default.",
      whyItMatters: "An address on the shop's own domain, that actually receives mail, is a basic legitimacy signal.",
    });
  }
  if (isPlaceholder(store.legalName)) {
    issues.push({
      field: "Registered legal name",
      severity: "medium",
      detail: "Not set, so legalName is omitted from the Organization markup.",
      whyItMatters: "Checkers cross-reference the registered entity against WHOIS and business registries.",
    });
  }
  if (isPlaceholder(store.logoUrl)) {
    issues.push({
      field: "Logo",
      severity: "low",
      detail: "No logo saved, so none is published and the PDF falls back to a text watermark.",
      whyItMatters: "A logo appears in search results and in the spec sheets customers download.",
    });
  }
  const socials = Object.values(store.social ?? {}).filter((u) => u && !isPlaceholder(u));
  if (socials.length === 0) {
    issues.push({
      field: "Social profiles",
      severity: "medium",
      detail: "No social links set, so sameAs is omitted.",
      whyItMatters: "sameAs is how a search engine connects this domain to profiles it already trusts.",
    });
  }

  return issues;
}

/** Things that must never be built. Rendered in the admin as a standing note. */
export const NEVER_BUILD = [
  "aggregateRating or Review markup for reviews that do not exist — the commonest cause of a structured-data manual action, and the penalty falls on the whole domain",
  "Hidden text, cloaking, or content served to crawlers but not to people",
  "Markup or pages imitating a review or trust-rating service",
] as const;

/** What actually moves the number. */
export const WHAT_ACTUALLY_HELPS = [
  "Contact details that resolve — a phone somebody answers and an address that exists",
  "Public WHOIS rather than privacy-shielded registration",
  "A claimed business profile on the major search engines",
  "Real reviews collected from customers after delivery",
] as const;
