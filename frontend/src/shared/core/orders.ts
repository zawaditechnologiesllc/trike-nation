/**
 * How an order is named to a human.
 *
 * Migration 004 gave orders a real number (GCG-2026-0148). Everything written
 * before that fell back to the first eight characters of the uuid, and rows
 * created before the migration still have no number at all — so the fallback
 * has to stay.
 *
 * The reason this lives in shared/core rather than next to any one caller:
 * the customer reads this string in an email, then again on their order page,
 * then quotes it to support, who reads it in the admin table. Two
 * implementations means the email says GCG-2026-0148 while the page says
 * #A1B2C3D4, and nobody can tell they are the same order.
 */
export function orderReference(orderId: string, orderNumber?: string | null): string {
  const number = orderNumber?.trim();
  if (number) return number;
  return `#${orderId.slice(0, 8).toUpperCase()}`;
}

/** True when the reference is a real allocated number rather than the uuid fallback. */
export function hasOrderNumber(orderNumber?: string | null): boolean {
  return Boolean(orderNumber?.trim());
}
