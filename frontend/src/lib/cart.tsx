"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CartItem, Product } from "./types";

const STORAGE_KEY = "gocartgrip-cart";

/**
 * Colour is part of the LINE IDENTITY: the same product in two colours is two
 * lines, not one line of quantity two. Keying the cart on slug alone silently
 * merges them, and the buyer receives two of whichever colour was added first.
 */
export function lineKey(slug: string, color?: string | null): string {
  return color ? `${slug}::${color}` : slug;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotalCents: number;
  add: (product: Product, qty?: number, color?: string | null) => void;
  remove: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  /** Replaces prices from the live catalogue — never trust a stale client price. */
  refresh: (products: Product[]) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        // Carts saved before colours existed have no key; derive one so an old
        // cart does not vanish on upgrade.
        setItems(parsed.map((i) => ({ ...i, key: i.key ?? lineKey(i.slug, i.color) })));
      }
    } catch {
      // corrupted storage — start fresh
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loaded]);

  const add = useCallback((product: Product, qty = 1, color?: string | null) => {
    // Fall back to the product's first colour: every unit has one whether or
    // not the buyer thought about it.
    const chosen = color ?? product.colors?.[0]?.name ?? null;
    const key = lineKey(product.slug, chosen);
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i));
      return [
        ...prev,
        {
          key,
          slug: product.slug,
          name: product.name,
          priceCents: product.priceCents,
          image: product.image,
          color: chosen,
          qty,
        },
      ];
    });
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setItems((prev) =>
      qty <= 0 ? prev.filter((i) => i.key !== key) : prev.map((i) => (i.key === key ? { ...i, qty } : i)),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  /**
   * Re-reads price, name and availability from the live product records. A
   * cart can sit in localStorage for weeks; showing a stale price and then
   * charging the current one is how a shop earns a chargeback.
   */
  const refresh = useCallback((products: Product[]) => {
    setItems((prev) => {
      const bySlug = new Map(products.map((p) => [p.slug, p]));
      return prev
        .filter((i) => bySlug.has(i.slug))
        .map((i) => {
          const product = bySlug.get(i.slug)!;
          return { ...i, name: product.name, priceCents: product.priceCents, image: product.image };
        });
    });
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, i) => sum + i.qty, 0);
    const subtotalCents = items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
    return { items, count, subtotalCents, add, remove, setQty, clear, refresh };
  }, [items, add, remove, setQty, clear, refresh]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
