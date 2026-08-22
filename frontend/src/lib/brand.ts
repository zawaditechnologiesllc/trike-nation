/**
 * Single source of truth for the Go Cart Grip brand: name, domain, and every
 * address on gocartgrip.shop that the storefront exposes. Import from here
 * instead of hard-coding an address in a page — admin-editable values still
 * win (site settings), these are the defaults and the department inboxes.
 */

export const BRAND = {
  name: "Go Cart Grip",
  legalName: "Go Cart Grip",
  tagline: "Grip. Throttle. Go.",
  domain: "gocartgrip.shop",
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://gocartgrip.shop",
} as const;

/** Department inboxes — all on the verified sending domain. */
export const EMAILS = {
  support: `support@${BRAND.domain}`,
  orders: `orders@${BRAND.domain}`,
  sales: `sales@${BRAND.domain}`,
  warranty: `warranty@${BRAND.domain}`,
  privacy: `privacy@${BRAND.domain}`,
  admin: `admin@${BRAND.domain}`,
  noreply: `no-reply@${BRAND.domain}`,
} as const;

export const SOCIAL = {
  facebook: "https://facebook.com/gocartgrip",
  instagram: "https://instagram.com/gocartgrip",
  threads: "https://threads.net/@gocartgrip",
} as const;

/** Advertised delivery window — matches the backend's cron update copy. */
export const DELIVERY_WINDOW = { minDays: 12, maxDays: 30 } as const;
