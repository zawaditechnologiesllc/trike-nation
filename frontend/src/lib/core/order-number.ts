/**
 * Human-readable order numbers: GCG-2026-0148.
 *
 * The uuid stays the primary key — this is what goes in an email subject and
 * what a customer reads out on the phone. Sequence allocation happens in the
 * database (a UNIQUE constraint), never by counting rows here.
 */

export const ORDER_NUMBER_PREFIX = "GCG";

export function formatOrderNumber(year: number, sequence: number, prefix = ORDER_NUMBER_PREFIX): string {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

const PATTERN = /^([A-Z]{2,4})-(\d{4})-(\d{4,})$/;

export function parseOrderNumber(
  value: string | null | undefined,
): { prefix: string; year: number; sequence: number } | null {
  const match = value?.trim().toUpperCase().match(PATTERN);
  if (!match) return null;
  return { prefix: match[1], year: Number(match[2]), sequence: Number(match[3]) };
}

/** Short display form used where space is tight — falls back to the uuid. */
export function shortOrderRef(orderNumber: string | null | undefined, id: string): string {
  return orderNumber?.trim() || `#${id.slice(0, 8).toUpperCase()}`;
}
