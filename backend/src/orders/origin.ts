import type { Request } from "express";
import { assessRisk, type OrderOrigin } from "../../../frontend/src/shared/core/risk";

/**
 * What the CDN already knows about the connection, plus the timezone the
 * browser reports for itself. It rides along on the request, costs no extra
 * latency, and the (country, timezone) pair is the genuinely useful one: a VPN
 * moves the IP but not the computer's clock.
 *
 * The IP address itself is deliberately NOT read and NOT stored — most
 * sensitive field, least useful for review.
 */

/** Cloudflare sets these; other CDNs use near-identical names. */
function header(req: Request, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readOrigin(req: Request, browserTimezone?: string | null): OrderOrigin {
  return {
    country: header(req, "cf-ipcountry") ?? header(req, "x-vercel-ip-country"),
    region: header(req, "cf-region") ?? header(req, "x-vercel-ip-country-region"),
    city: header(req, "cf-ipcity") ?? header(req, "x-vercel-ip-city"),
    network: header(req, "cf-ipasn") ?? header(req, "cf-connecting-asn"),
    timezone: browserTimezone?.trim() || header(req, "cf-timezone"),
    isTor: header(req, "cf-ipcountry") === "T1" || header(req, "cf-threat-tor") === "1",
    isVpn: header(req, "cf-is-vpn") === "1" || null,
    isDatacenter: header(req, "cf-is-datacenter") === "1" || null,
  };
}

/** The columns written on the order. Note the absence of an ip_address field. */
export function originColumns(origin: OrderOrigin, shippingCountry?: string | null) {
  const assessment = assessRisk(origin, shippingCountry);
  return {
    origin_country: origin.country ?? null,
    origin_region: origin.region ?? null,
    origin_city: origin.city ?? null,
    origin_network: origin.network ?? null,
    origin_timezone: origin.timezone ?? null,
    origin_is_tor: origin.isTor ?? null,
    origin_is_vpn: origin.isVpn ?? null,
    origin_is_datacenter: origin.isDatacenter ?? null,
    risk_level: assessment.level,
    risk_score: assessment.score,
    risk_flags: assessment.flags,
  };
}
