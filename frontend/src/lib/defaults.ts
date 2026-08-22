import { BRAND, EMAILS, SOCIAL } from "./brand";
import type { SiteSettings } from "./types";

/**
 * Render-time fallback if the settings API is briefly unreachable, so the
 * chrome (header/footer/hero) never renders blank. Keep in sync with
 * /data/site-settings.json — the seeded values admins edit in /admin/settings.
 */
export const DEFAULT_SETTINGS: SiteSettings = {
  hero: {
    kicker: "Handcrafted Performance",
    title: `${BRAND.name}:`,
    accent: "Adrenaline",
    subtitle:
      "Engineered for the bold. Experience the raw energy of high-performance mini trikes and drift karts built for ultimate durability and speed.",
    primaryLabel: "Shop the Fleet",
    primaryHref: "/shop",
    secondaryLabel: "Custom Orders",
    secondaryHref: "/contact",
  },
  announcements: [
    "Use the coupon BIKEMIKE26 for 10% discount",
    "Black Friday Madness — up to 20% off",
    "Now shipping worldwide",
  ],
  contact: {
    phone: "+1 (916) 436-8303",
    email: EMAILS.support,
    address: "4821 Throttle Way, Sacramento, CA 95814",
    hours: "Mon–Fri, 8am–5pm PT",
  },
  social: { ...SOCIAL },
};
