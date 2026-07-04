"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import type { Product } from "@/lib/types";

export default function AddToCartButton({
  product,
  withQty = false,
  className = "",
}: {
  product: Product;
  withQty?: boolean;
  className?: string;
}) {
  const { add } = useCart();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    add(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
    if (withQty) router.push("/cart");
  }

  return (
    <div className={`flex items-stretch gap-3 ${className}`}>
      {withQty && (
        <div className="flex items-center border-2 border-steel-light font-mono">
          <button
            aria-label="Decrease quantity"
            className="px-4 py-3 text-chrome hover:text-ember"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
          >
            −
          </button>
          <span className="min-w-8 text-center font-bold">{String(qty).padStart(2, "0")}</span>
          <button
            aria-label="Increase quantity"
            className="px-4 py-3 text-chrome hover:text-ember"
            onClick={() => setQty((q) => q + 1)}
          >
            +
          </button>
        </div>
      )}
      <button
        onClick={handleAdd}
        className="display glow-red flex-1 bg-crimson px-6 py-3 text-lg text-offwhite transition-colors hover:bg-ember"
      >
        {added ? "Added ✓" : "Add to Cart →"}
      </button>
    </div>
  );
}
