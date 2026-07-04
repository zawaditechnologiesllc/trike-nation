export interface PricedItem {
  productId: string | null;
  slug: string;
  name: string;
  unitCents: number;
  qty: number;
}

export interface OrderPricing {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  percentOff: number;
}

export function clampQty(qty: unknown): number {
  return Math.max(1, Math.min(99, Math.floor(Number(qty) || 1)));
}

export function computePricing(items: PricedItem[], percentOff: number): OrderPricing {
  const subtotalCents = items.reduce((sum, item) => sum + item.unitCents * item.qty, 0);
  const pct = Math.max(0, Math.min(100, percentOff));
  const discountCents = Math.round((subtotalCents * pct) / 100);
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents, percentOff: pct };
}
