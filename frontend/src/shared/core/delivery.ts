/**
 * The delivery window quoted to the buyer.
 *
 * This is NOT the stage schedule (see stages.ts). Two different numbers that
 * are constantly confused: this one is a promise shown on product pages, the
 * cart, checkout, the PDF and every email; that one decides when a tracking
 * email fires. Conflating them means either emailing "arriving today" a week
 * early, or quoting a date the emails contradict.
 *
 * Dependency-free on purpose: the browser, the server, the emails and the
 * tests all read this one definition.
 */

export const BUILD_MIN_DAYS = 12;
export const BUILD_MAX_DAYS = 30;

/**
 * Transit allowance on top of the build window, by destination zone. The
 * buffer is deliberate and we say so in the shipped email — an unexplained
 * three-week estimate reads as a slow shop, an explained one reads as a
 * careful shop and the buyer stops watching the calendar.
 */
export const TRANSIT_DAYS = {
  domestic: 0,
  near: 3,
  established: 5,
  extended: 7,
} as const;

export type Zone = keyof typeof TRANSIT_DAYS;

/** ISO-3166 alpha-2 → zone. Anything unlisted is `extended`, never refused. */
const ZONE_BY_COUNTRY: Record<string, Zone> = {
  US: "domestic",
  CA: "near",
  MX: "near",
  GB: "established",
  IE: "established",
  DE: "established",
  FR: "established",
  ES: "established",
  IT: "established",
  NL: "established",
  BE: "established",
  SE: "established",
  NO: "established",
  DK: "established",
  FI: "established",
  AT: "established",
  CH: "established",
  PL: "established",
  PT: "established",
  AU: "established",
  NZ: "established",
  JP: "established",
  SG: "established",
  AE: "established",
};

export function zoneFor(countryCode: string | null | undefined): Zone {
  if (!countryCode) return "extended";
  return ZONE_BY_COUNTRY[countryCode.trim().toUpperCase()] ?? "extended";
}

export interface DeliveryWindow {
  minDays: number;
  maxDays: number;
  zone: Zone;
  transitDays: number;
}

export function deliveryWindow(countryCode?: string | null): DeliveryWindow {
  const zone = zoneFor(countryCode);
  const transitDays = TRANSIT_DAYS[zone];
  return {
    minDays: BUILD_MIN_DAYS + transitDays,
    maxDays: BUILD_MAX_DAYS + transitDays,
    zone,
    transitDays,
  };
}

/** "12–30 days" / "17–35 days" — the one phrasing used on every surface. */
export function deliveryWindowLabel(countryCode?: string | null): string {
  const w = deliveryWindow(countryCode);
  return `${w.minDays}–${w.maxDays} days`;
}

const DAY_MS = 86_400_000;

/** Estimated arrival date, from the day payment was confirmed. */
export function estimatedDeliveryAt(paidAt: Date, countryCode?: string | null): Date {
  return new Date(paidAt.getTime() + deliveryWindow(countryCode).maxDays * DAY_MS);
}

/**
 * The sentence that turns a long estimate into a careful one. Present in the
 * shipped email by design — removing it measurably raises "where is my order".
 */
export const BUFFER_EXPLANATION =
  "We add a 7-day buffer to every estimate so a hold-up at the courier's end doesn't become a broken promise. Most orders arrive ahead of it.";
