"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchProducts } from "@/lib/api";
import { useWishlist } from "@/lib/wishlist";
import ProductCard from "@/components/ProductCard";
import type { Product } from "@/lib/types";

export default function WishlistPage() {
  const { slugs, count } = useWishlist();
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    void fetchProducts().then(setProducts);
  }, []);

  const saved = (products ?? []).filter((p) => slugs.includes(p.slug));

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-12">
      <p className="label-caps text-on-secondary-fixed">Saved</p>
      <h1 className="display mt-2 text-4xl md:text-5xl">Your Wishlist</h1>

      {products === null ? (
        <p className="label-caps mt-8 text-on-surface-muted">Loading…</p>
      ) : count === 0 ? (
        <div className="mt-8 border border-outline bg-surface-container p-12 text-center">
          <p className="display text-2xl text-on-surface-muted">Nothing saved yet</p>
          <p className="mt-2 font-mono text-sm text-on-surface-muted">
            Tap Save on any machine to keep it here. No account needed.
          </p>
          <Link href="/shop" className="display glow-red mt-6 inline-block bg-primary px-6 py-2 text-on-primary hover:bg-secondary">
            Shop the Fleet
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
