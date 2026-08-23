/**
 * Shop price filters, derived from the live catalogue.
 *
 * Hard-coded bands are a link to an empty grid the moment the catalogue moves.
 * These are computed from the actual prices, snapped to round numbers, and
 * carry their own counts — a band showing "(0)" would not be offered at all.
 */

export interface PriceBand {
  /** Inclusive, in cents. `max` is null on the open-ended top band. */
  min: number;
  max: number | null;
  label: string;
  count: number;
}

const money = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/** Round numbers a shopper recognises, in cents. */
function roundStep(spread: number): number {
  const candidates = [5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000];
  const target = spread / 4;
  return candidates.find((step) => step >= target) ?? candidates[candidates.length - 1];
}

/**
 * Builds up to four bands covering the catalogue. Empty bands are dropped, so
 * every filter offered leads somewhere.
 */
export function derivePriceBands(pricesCents: number[]): PriceBand[] {
  const prices = pricesCents.filter((p) => Number.isFinite(p) && p >= 0).sort((a, b) => a - b);
  if (prices.length === 0) return [];

  const low = prices[0];
  const high = prices[prices.length - 1];
  if (low === high) {
    return [{ min: 0, max: null, label: `All (${money(low)})`, count: prices.length }];
  }

  const step = roundStep(high - low);
  const start = Math.floor(low / step) * step;

  const edges: number[] = [];
  for (let edge = start + step; edge < high; edge += step) edges.push(edge);
  // Too many bands is a wall of links; too few is not a filter. Keep 3 cuts.
  while (edges.length > 3) {
    edges.splice(Math.floor(edges.length / 2), 1);
  }

  const bounds: { min: number; max: number | null }[] = [];
  let previous = 0;
  for (const edge of edges) {
    bounds.push({ min: previous, max: edge - 1 });
    previous = edge;
  }
  bounds.push({ min: previous, max: null });

  return bounds
    .map(({ min, max }) => ({
      min,
      max,
      label:
        max === null
          ? `${money(min)} and up`
          : min === 0
            ? `Under ${money(max + 1)}`
            : `${money(min)} – ${money(max + 1)}`,
      count: prices.filter((p) => p >= min && (max === null || p <= max)).length,
    }))
    .filter((band) => band.count > 0);
}

/** Parses the min/max GET form. Bad input is ignored, never an error page. */
export function parsePriceRange(
  minRaw: string | null | undefined,
  maxRaw: string | null | undefined,
): { minCents: number | null; maxCents: number | null } {
  const toCents = (raw: string | null | undefined): number | null => {
    if (!raw) return null;
    const text = String(raw).trim();
    // Check the sign BEFORE stripping: "-5" would otherwise strip to "5" and
    // a nonsense input would become a real $5 filter.
    if (/^-/.test(text)) return null;
    // Strip currency symbols and separators a human types. If nothing numeric
    // survives, that is junk — return null, not 0: Number("") is 0, and a
    // stray 0 silently becomes a "minimum price" filter.
    const digits = text.replace(/[^0-9.]/g, "");
    if (!/\d/.test(digits)) return null;
    const value = Number(digits);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100);
  };
  let minCents = toCents(minRaw);
  let maxCents = toCents(maxRaw);
  // A reversed range is a typo, not an empty shop.
  if (minCents !== null && maxCents !== null && minCents > maxCents) {
    [minCents, maxCents] = [maxCents, minCents];
  }
  return { minCents, maxCents };
}

export function withinRange(
  priceCents: number,
  range: { minCents: number | null; maxCents: number | null },
): boolean {
  if (range.minCents !== null && priceCents < range.minCents) return false;
  if (range.maxCents !== null && priceCents > range.maxCents) return false;
  return true;
}
