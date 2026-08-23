"use client";

import { useWishlist } from "@/lib/wishlist";
import type { Product } from "@/lib/types";

export default function WishlistButton({ product, className = "" }: { product: Product; className?: string }) {
  const { has, toggle } = useWishlist();
  const saved = has(product.slug);
  return (
    <button
      type="button"
      onClick={() => toggle(product.slug, product.id)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      className={`label-caps border px-4 py-3 transition-colors ${
        saved
          ? "border-secondary text-secondary"
          : "border-outline-variant text-on-surface-variant hover:border-secondary hover:text-secondary"
      } ${className}`}
    >
      {saved ? "♥ Saved" : "♡ Save"}
    </button>
  );
}
