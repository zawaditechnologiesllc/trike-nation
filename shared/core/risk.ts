/**
 * Advisory fraud flags for order review.
 *
 * Three rules this module exists to enforce:
 *   1. NEVER refuse an order on these signals. A corporate VPN, a
 *      privacy-minded customer, an expat and a traveller all trip them.
 *   2. NEVER store the IP address — the most sensitive field and the least
 *      useful for review.
 *   3. No single flag except Tor may reach the top level. An owner who sees
 *      red on every VPN user stops reading badges within a week, and then the
 *      one order that mattered goes past unread too.
 *
 * The genuinely useful signal is the pair (CDN country, browser timezone): a
 * VPN moves the IP but not the computer's clock. It rides along on the request
 * and costs no latency.
 */

export interface OrderOrigin {
  /** From the CDN. Never the IP itself. */
  country?: string | null;
  region?: string | null;
  city?: string | null;
  /** Network / ASN description, e.g. "AS13335 Cloudflare". */
  network?: string | null;
  /** What the browser says its own timezone is. */
  timezone?: string | null;
  /** CDN-reported flags, when available. */
  isTor?: boolean | null;
  isVpn?: boolean | null;
  isDatacenter?: boolean | null;
}

export type RiskLevel = "clear" | "note" | "review" | "high";

export interface RiskFlag {
  code: string;
  label: string;
  /** Plain English, for an owner who is not a fraud analyst. */
  explanation: string;
  weight: number;
}

/** Rough country → plausible timezone prefixes. Absence proves nothing. */
const TIMEZONE_HINTS: Record<string, string[]> = {
  US: ["America/"], CA: ["America/"], MX: ["America/"], BR: ["America/"],
  AR: ["America/"], CL: ["America/"], CO: ["America/"], PE: ["America/"],
  GB: ["Europe/London"], IE: ["Europe/Dublin"], FR: ["Europe/Paris"],
  DE: ["Europe/Berlin", "Europe/Busingen"], NL: ["Europe/Amsterdam"],
  BE: ["Europe/Brussels"], ES: ["Europe/Madrid", "Atlantic/Canary"],
  IT: ["Europe/Rome"], PT: ["Europe/Lisbon", "Atlantic/"], CH: ["Europe/Zurich"],
  AT: ["Europe/Vienna"], SE: ["Europe/Stockholm"], NO: ["Europe/Oslo"],
  DK: ["Europe/Copenhagen"], FI: ["Europe/Helsinki"], PL: ["Europe/Warsaw"],
  AU: ["Australia/"], NZ: ["Pacific/Auckland", "Pacific/Chatham"],
  JP: ["Asia/Tokyo"], KR: ["Asia/Seoul"], CN: ["Asia/Shanghai", "Asia/Urumqi"],
  IN: ["Asia/Kolkata", "Asia/Calcutta"], SG: ["Asia/Singapore"],
  AE: ["Asia/Dubai"], ZA: ["Africa/Johannesburg"], NG: ["Africa/Lagos"],
  KE: ["Africa/Nairobi"], EG: ["Africa/Cairo"],
};

function timezoneMatchesCountry(country: string, timezone: string): boolean {
  const hints = TIMEZONE_HINTS[country.toUpperCase()];
  // No hints on file → we cannot say it mismatches, so we do not claim it does.
  if (!hints) return true;
  return hints.some((hint) => timezone.startsWith(hint));
}

/**
 * Weights are chosen so that no single flag except Tor reaches "high".
 * `review` starts at 5, `high` at 8; the largest non-Tor weight is 4.
 */
export function riskFlags(origin: OrderOrigin, shippingCountry?: string | null): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const originCountry = origin.country?.toUpperCase() ?? null;
  const shipTo = shippingCountry?.toUpperCase() ?? null;

  if (origin.isTor) {
    flags.push({
      code: "tor",
      label: "Tor exit node",
      explanation:
        "The order came through the Tor network, which hides the customer's location entirely. Legitimate but very rare for a retail purchase — worth a manual look before shipping.",
      weight: 8,
    });
  }

  if (origin.isVpn && !origin.isTor) {
    flags.push({
      code: "vpn",
      label: "Commercial VPN",
      explanation:
        "The connection came through a consumer VPN service. Extremely common among privacy-minded customers and anyone on a work laptop — on its own this means very little.",
      weight: 2,
    });
  }

  if (origin.isDatacenter && !origin.isVpn && !origin.isTor) {
    flags.push({
      code: "datacenter",
      label: "Datacentre connection",
      explanation:
        "The connection came from a hosting provider rather than a home or mobile network. Often a corporate VPN or a cloud desktop; occasionally automation.",
      weight: 3,
    });
  }

  if (originCountry && origin.timezone && !timezoneMatchesCountry(originCountry, origin.timezone)) {
    flags.push({
      code: "clock_mismatch",
      label: "Clock does not match location",
      explanation: `The connection looks like it is in ${originCountry}, but the computer's clock is set to ${origin.timezone}. A VPN moves the address but not the clock — this is the single most useful signal here. It is also exactly what a traveller or an expat looks like.`,
      weight: 4,
    });
  }

  if (originCountry && shipTo && originCountry !== shipTo) {
    flags.push({
      code: "cross_border",
      label: "Ordering from another country",
      explanation: `The order was placed from ${originCountry} but ships to ${shipTo}. Normal for gifts, expats and anyone travelling.`,
      weight: 2,
    });
  }

  if (!originCountry) {
    flags.push({
      code: "no_location",
      label: "No location data",
      explanation:
        "The CDN gave us no location for this connection. Usually a privacy browser or an unusual network — not evidence of anything on its own.",
      weight: 1,
    });
  }

  return flags;
}

export function riskScore(flags: RiskFlag[]): number {
  return flags.reduce((total, flag) => total + flag.weight, 0);
}

export function riskLevel(flags: RiskFlag[]): RiskLevel {
  const score = riskScore(flags);
  if (score >= 8) return "high";
  if (score >= 5) return "review";
  if (score >= 1) return "note";
  return "clear";
}

/** Only "review" and above earn a badge on the order list. */
export function shouldBadge(level: RiskLevel): boolean {
  return level === "review" || level === "high";
}

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  flags: RiskFlag[];
  /** One line for the order list; the full panel lists every flag. */
  summary: string;
}

export function assessRisk(origin: OrderOrigin, shippingCountry?: string | null): RiskAssessment {
  const flags = riskFlags(origin, shippingCountry);
  const level = riskLevel(flags);
  const summary =
    flags.length === 0
      ? "Nothing unusual about this connection."
      : flags.map((f) => f.label).join(" · ");
  return { level, score: riskScore(flags), flags, summary };
}
