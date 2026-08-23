/**
 * Couriers, and the honesty rule about tracking links.
 *
 * A link that lands on "not found" makes the customer think nothing shipped —
 * worse than showing a bare reference. So we only ever link out when BOTH are
 * true: the courier has a known tracking URL, and the number is not one we
 * generated ourselves (an internal reference means nothing to a carrier).
 */

export interface Courier {
  id: string;
  name: string;
  region: string;
  /** `{tracking}` is substituted. Absent means: show the number, do not link. */
  trackingUrl?: string;
}

export const COURIERS: Courier[] = [
  // --- Global ---
  { id: "dhl", name: "DHL Express", region: "Global", trackingUrl: "https://www.dhl.com/en/express/tracking.html?AWB={tracking}" },
  { id: "dhl-ecommerce", name: "DHL eCommerce", region: "Global", trackingUrl: "https://www.dhl.com/en/express/tracking.html?AWB={tracking}" },
  { id: "fedex", name: "FedEx", region: "Global", trackingUrl: "https://www.fedex.com/fedextrack/?trknbr={tracking}" },
  { id: "ups", name: "UPS", region: "Global", trackingUrl: "https://www.ups.com/track?tracknum={tracking}" },
  { id: "tnt", name: "TNT", region: "Global", trackingUrl: "https://www.tnt.com/express/en_gb/site/shipping-tools/tracking.html?searchType=con&cons={tracking}" },
  { id: "aramex", name: "Aramex", region: "Global", trackingUrl: "https://www.aramex.com/us/en/track/results?ShipmentNumber={tracking}" },
  { id: "dbschenker", name: "DB Schenker", region: "Global" },
  { id: "kuehne-nagel", name: "Kuehne+Nagel", region: "Global" },
  { id: "expeditors", name: "Expeditors", region: "Global" },
  { id: "geodis", name: "GEODIS", region: "Global" },

  // --- North America ---
  { id: "usps", name: "USPS", region: "North America", trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels={tracking}" },
  { id: "ontrac", name: "OnTrac", region: "North America", trackingUrl: "https://www.ontrac.com/tracking/?number={tracking}" },
  { id: "lasership", name: "LaserShip", region: "North America", trackingUrl: "https://www.lasership.com/track/{tracking}" },
  { id: "estes", name: "Estes Express (freight)", region: "North America", trackingUrl: "https://www.estes-express.com/myestes/shipment-tracking/#/search?type=pro&query={tracking}" },
  { id: "xpo", name: "XPO Logistics (freight)", region: "North America", trackingUrl: "https://www.xpo.com/track/?reference={tracking}" },
  { id: "rl-carriers", name: "R+L Carriers (freight)", region: "North America" },
  { id: "old-dominion", name: "Old Dominion (freight)", region: "North America", trackingUrl: "https://www.odfl.com/us/en/tools/trace-shipment.html?proNumber={tracking}" },
  { id: "saia", name: "Saia (freight)", region: "North America" },
  { id: "abf", name: "ABF Freight", region: "North America" },
  { id: "yrc", name: "YRC Freight", region: "North America" },
  { id: "canada-post", name: "Canada Post", region: "North America", trackingUrl: "https://www.canadapost-postescanada.ca/track-reperage/en#/details/{tracking}" },
  { id: "purolator", name: "Purolator", region: "North America", trackingUrl: "https://www.purolator.com/en/shipping/tracker?pin={tracking}" },
  { id: "canpar", name: "Canpar Express", region: "North America" },
  { id: "loomis", name: "Loomis Express", region: "North America" },
  { id: "estafeta", name: "Estafeta", region: "North America" },
  { id: "correos-mexico", name: "Correos de México", region: "North America" },

  // --- United Kingdom & Ireland ---
  { id: "royal-mail", name: "Royal Mail", region: "UK & Ireland", trackingUrl: "https://www.royalmail.com/track-your-item#/tracking-results/{tracking}" },
  { id: "parcelforce", name: "Parcelforce", region: "UK & Ireland", trackingUrl: "https://www.parcelforce.com/track-trace?trackNumber={tracking}" },
  { id: "dpd-uk", name: "DPD UK", region: "UK & Ireland", trackingUrl: "https://track.dpd.co.uk/search?reference={tracking}" },
  { id: "evri", name: "Evri (Hermes)", region: "UK & Ireland", trackingUrl: "https://www.evri.com/track/parcel/{tracking}" },
  { id: "yodel", name: "Yodel", region: "UK & Ireland", trackingUrl: "https://www.yodel.co.uk/track/{tracking}" },
  { id: "tuffnells", name: "Tuffnells (freight)", region: "UK & Ireland" },
  { id: "palletways", name: "Palletways (freight)", region: "UK & Ireland" },
  { id: "an-post", name: "An Post", region: "UK & Ireland", trackingUrl: "https://www.anpost.com/Post-Parcels/Track?item={tracking}" },
  { id: "fastway-ie", name: "Fastway Ireland", region: "UK & Ireland" },

  // --- Europe ---
  { id: "dpd", name: "DPD", region: "Europe", trackingUrl: "https://tracking.dpd.de/status/en_US/parcel/{tracking}" },
  { id: "gls", name: "GLS", region: "Europe", trackingUrl: "https://gls-group.eu/EU/en/parcel-tracking?match={tracking}" },
  { id: "deutsche-post", name: "Deutsche Post", region: "Europe" },
  { id: "hermes-de", name: "Hermes Germany", region: "Europe" },
  { id: "colissimo", name: "Colissimo", region: "Europe", trackingUrl: "https://www.laposte.fr/outils/suivre-vos-envois?code={tracking}" },
  { id: "chronopost", name: "Chronopost", region: "Europe", trackingUrl: "https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT={tracking}" },
  { id: "mondial-relay", name: "Mondial Relay", region: "Europe" },
  { id: "postnl", name: "PostNL", region: "Europe", trackingUrl: "https://jouw.postnl.nl/track-and-trace/{tracking}" },
  { id: "bpost", name: "bpost", region: "Europe", trackingUrl: "https://track.bpost.cloud/btr/water/secured/track?itemCode={tracking}" },
  { id: "correos", name: "Correos (Spain)", region: "Europe" },
  { id: "seur", name: "SEUR", region: "Europe" },
  { id: "mrw", name: "MRW", region: "Europe" },
  { id: "ctt", name: "CTT (Portugal)", region: "Europe" },
  { id: "poste-italiane", name: "Poste Italiane", region: "Europe" },
  { id: "brt", name: "BRT (Bartolini)", region: "Europe" },
  { id: "postnord", name: "PostNord", region: "Europe", trackingUrl: "https://www.postnord.se/en/track-and-trace?shipmentId={tracking}" },
  { id: "bring", name: "Bring", region: "Europe" },
  { id: "posti", name: "Posti", region: "Europe" },
  { id: "swiss-post", name: "Swiss Post", region: "Europe" },
  { id: "austrian-post", name: "Austrian Post", region: "Europe" },
  { id: "inpost", name: "InPost", region: "Europe", trackingUrl: "https://inpost.pl/sledzenie-przesylek?number={tracking}" },
  { id: "poczta-polska", name: "Poczta Polska", region: "Europe" },
  { id: "ceska-posta", name: "Česká pošta", region: "Europe" },
  { id: "packeta", name: "Packeta (Zásilkovna)", region: "Europe" },
  { id: "sameday", name: "Sameday", region: "Europe" },
  { id: "cargus", name: "Cargus", region: "Europe" },
  { id: "speedy", name: "Speedy", region: "Europe" },
  { id: "econt", name: "Econt", region: "Europe" },
  { id: "acs", name: "ACS Courier", region: "Europe" },
  { id: "elta", name: "ELTA", region: "Europe" },
  { id: "ptt", name: "PTT Kargo", region: "Europe" },
  { id: "yurtici", name: "Yurtiçi Kargo", region: "Europe" },
  { id: "nova-poshta", name: "Nova Poshta", region: "Europe", trackingUrl: "https://novaposhta.ua/en/tracking/?cargo_number={tracking}" },

  // --- Asia Pacific ---
  { id: "australia-post", name: "Australia Post", region: "Asia Pacific", trackingUrl: "https://auspost.com.au/mypost/track/#/details/{tracking}" },
  { id: "startrack", name: "StarTrack", region: "Asia Pacific" },
  { id: "aramex-au", name: "Aramex Australia (Fastway)", region: "Asia Pacific" },
  { id: "toll", name: "Toll Group (freight)", region: "Asia Pacific" },
  { id: "nz-post", name: "NZ Post", region: "Asia Pacific", trackingUrl: "https://www.nzpost.co.nz/tools/tracking?trackid={tracking}" },
  { id: "japan-post", name: "Japan Post", region: "Asia Pacific" },
  { id: "yamato", name: "Yamato Transport", region: "Asia Pacific" },
  { id: "sagawa", name: "Sagawa Express", region: "Asia Pacific" },
  { id: "cj-logistics", name: "CJ Logistics", region: "Asia Pacific" },
  { id: "korea-post", name: "Korea Post", region: "Asia Pacific" },
  { id: "sf-express", name: "SF Express", region: "Asia Pacific", trackingUrl: "https://www.sf-express.com/us/en/dynamic_function/waybill/#search/bill-number/{tracking}" },
  { id: "china-post", name: "China Post", region: "Asia Pacific" },
  { id: "ems", name: "EMS", region: "Asia Pacific" },
  { id: "cainiao", name: "Cainiao", region: "Asia Pacific" },
  { id: "yunexpress", name: "YunExpress", region: "Asia Pacific" },
  { id: "4px", name: "4PX", region: "Asia Pacific" },
  { id: "sfc", name: "SFC Service", region: "Asia Pacific" },
  { id: "singpost", name: "SingPost", region: "Asia Pacific" },
  { id: "ninjavan", name: "Ninja Van", region: "Asia Pacific" },
  { id: "jt-express", name: "J&T Express", region: "Asia Pacific" },
  { id: "kerry", name: "Kerry Express", region: "Asia Pacific" },
  { id: "thailand-post", name: "Thailand Post", region: "Asia Pacific" },
  { id: "vnpost", name: "Vietnam Post", region: "Asia Pacific" },
  { id: "pos-malaysia", name: "Pos Malaysia", region: "Asia Pacific" },
  { id: "jne", name: "JNE", region: "Asia Pacific" },
  { id: "delhivery", name: "Delhivery", region: "Asia Pacific", trackingUrl: "https://www.delhivery.com/track/package/{tracking}" },
  { id: "bluedart", name: "Blue Dart", region: "Asia Pacific", trackingUrl: "https://www.bluedart.com/tracking/{tracking}" },
  { id: "dtdc", name: "DTDC", region: "Asia Pacific" },
  { id: "india-post", name: "India Post", region: "Asia Pacific" },
  { id: "ecom-express", name: "Ecom Express", region: "Asia Pacific" },

  // --- Middle East & Africa ---
  { id: "emirates-post", name: "Emirates Post", region: "Middle East & Africa" },
  { id: "smsa", name: "SMSA Express", region: "Middle East & Africa" },
  { id: "naqel", name: "Naqel Express", region: "Middle East & Africa" },
  { id: "israel-post", name: "Israel Post", region: "Middle East & Africa" },
  { id: "egypt-post", name: "Egypt Post", region: "Middle East & Africa" },
  { id: "sapo", name: "South African Post Office", region: "Middle East & Africa" },
  { id: "ram-couriers", name: "RAM Couriers", region: "Middle East & Africa" },
  { id: "courier-guy", name: "The Courier Guy", region: "Middle East & Africa" },
  { id: "dawn-wing", name: "Dawn Wing", region: "Middle East & Africa" },
  { id: "gig-logistics", name: "GIG Logistics", region: "Middle East & Africa" },
  { id: "nipost", name: "NIPOST", region: "Middle East & Africa" },
  { id: "posta-kenya", name: "Posta Kenya", region: "Middle East & Africa" },

  // --- South America ---
  { id: "correios", name: "Correios (Brazil)", region: "South America", trackingUrl: "https://rastreamento.correios.com.br/app/index.php?objeto={tracking}" },
  { id: "jadlog", name: "Jadlog", region: "South America" },
  { id: "oca", name: "OCA", region: "South America" },
  { id: "andreani", name: "Andreani", region: "South America" },
  { id: "chilexpress", name: "Chilexpress", region: "South America" },
  { id: "servientrega", name: "Servientrega", region: "South America" },

  // --- Fallback ---
  { id: "other", name: "Other — type it in", region: "Other" },
];

export const COURIER_REGIONS = [
  "Global",
  "North America",
  "UK & Ireland",
  "Europe",
  "Asia Pacific",
  "Middle East & Africa",
  "South America",
  "Other",
] as const;

export function couriersByRegion(): { region: string; couriers: Courier[] }[] {
  return COURIER_REGIONS.map((region) => ({
    region,
    couriers: COURIERS.filter((c) => c.region === region),
  })).filter((group) => group.couriers.length > 0);
}

export function findCourier(id: string | null | undefined): Courier | undefined {
  if (!id) return undefined;
  return COURIERS.find((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// Internal references
// ---------------------------------------------------------------------------

/**
 * No I, L, O, U, 0 or 1: those are the characters a customer reads back wrong
 * over the phone, and U is dropped so the alphabet cannot spell anything.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

function checkCharacter(body: string): string {
  // Weighted sum, so a single transposed pair changes the check character.
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const value = ALPHABET.indexOf(body[i]);
    if (value >= 0) sum += value * (i + 1);
  }
  return ALPHABET[sum % ALPHABET.length];
}

/**
 * `GCG-2608-G625N2-C` — prefix, year+month, random body, check character.
 * `randomInt` is injected so tests are deterministic.
 */
export function generateInternalReference(
  now: Date = new Date(),
  randomInt: (max: number) => number = (max) => Math.floor(Math.random() * max),
  prefix = "GCG",
): string {
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  let body = "";
  for (let i = 0; i < 6; i++) body += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${year}${month}-${body}-${checkCharacter(body)}`;
}

const INTERNAL_REFERENCE = /^[A-Z]{2,4}-\d{4}-[2-9A-HJ-NP-Z]{6}-[2-9A-HJ-NP-Z]$/;

/** True for a reference this shop generated — those must never be linked out. */
export function isInternalReference(tracking: string | null | undefined): boolean {
  if (!tracking) return false;
  const value = tracking.trim().toUpperCase();
  if (!INTERNAL_REFERENCE.test(value)) return false;
  const body = value.split("-")[2];
  const check = value.split("-")[3];
  return checkCharacter(body) === check;
}

export interface TrackingLinkState {
  /** The URL to link to, or null when linking would be dishonest. */
  url: string | null;
  /** Shown to the ADMIN before saving, so they know what the customer gets. */
  explanation: string;
}

/**
 * The single decision about whether the customer sees a clickable link.
 * Both the admin preview and the customer-facing email read this, so what the
 * admin is promised is exactly what is sent.
 */
export function trackingLink(
  courierId: string | null | undefined,
  tracking: string | null | undefined,
): TrackingLinkState {
  const number = tracking?.trim() ?? "";
  if (!number) {
    return { url: null, explanation: "No tracking number yet — the customer sees no tracking section." };
  }
  if (isInternalReference(number)) {
    return {
      url: null,
      explanation:
        "This is an internal reference we generated, so it is shown as plain text. Linking it would send the customer to a carrier page that says 'not found'.",
    };
  }
  const courier = findCourier(courierId);
  if (!courier || courier.id === "other") {
    return {
      url: null,
      explanation: "No courier selected (or 'Other'), so the number is shown as plain text.",
    };
  }
  if (!courier.trackingUrl) {
    return {
      url: null,
      explanation: `${courier.name} has no public tracking URL on file, so the number is shown as plain text.`,
    };
  }
  return {
    url: courier.trackingUrl.replace("{tracking}", encodeURIComponent(number)),
    explanation: `The customer gets a clickable link to ${courier.name}.`,
  };
}
