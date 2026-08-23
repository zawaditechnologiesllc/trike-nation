"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth";

/**
 * Wishlist.
 *
 * Kept in localStorage for signed-out visitors and mirrored to Supabase once
 * they sign in, so saving something does not require an account — asking for
 * one before a customer has committed to anything is where they leave.
 */

const STORAGE_KEY = "gocartgrip-wishlist";

interface WishlistValue {
  slugs: string[];
  has: (slug: string) => boolean;
  toggle: (slug: string, productId?: string | null) => void;
  count: number;
}

const WishlistContext = createContext<WishlistValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSlugs(JSON.parse(raw) as string[]);
    } catch {
      // corrupted storage — start fresh
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  }, [slugs, loaded]);

  const toggle = useCallback(
    (slug: string, productId?: string | null) => {
      setSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));

      // Mirror to the database when signed in. Failing here must never undo
      // the local change: the visible behaviour is the local list.
      const supabase = getSupabase();
      if (!supabase || !user || !productId) return;
      const removing = slugs.includes(slug);
      void (removing
        ? supabase.from("wishlists").delete().eq("user_id", user.id).eq("product_id", productId)
        : supabase.from("wishlists").upsert({ user_id: user.id, product_id: productId })
      ).then(({ error }) => {
        if (error) console.warn("[wishlist] sync failed", error.message);
      });
    },
    [slugs, user],
  );

  const value = useMemo<WishlistValue>(
    () => ({ slugs, count: slugs.length, has: (slug) => slugs.includes(slug), toggle }),
    [slugs, toggle],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
}
