"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import ColorPicker from "./ColorPicker";
import type { Product } from "@/lib/types";

export default function AddToCartButton({
  product,
  withQty = false,
  withColors = false,
  className = "",
}: {
  product: Product;
  withQty?: boolean;
  /** Product page shows the swatches; a card in a grid does not. */
  withColors?: boolean;
  className?: string;
}) {
  const { add } = useCart();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const colors = product.colors ?? [];
  // Selected from the moment the page loads — never an empty state that
  // blocks the button.
  const [color, setColor] = useState<string | null>(colors[0]?.name ?? null);

  function handleAdd() {
    add(product, qty, color);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
    if (withQty) router.push("/cart");
  }

  return (
    <div className={className}>
      {withColors && colors.length > 0 && (
        <ColorPicker colors={colors} value={color} onChange={setColor} />
      )}
      <div className="mt-6 flex items-stretch gap-3">
        {withQty && (
          <div className="flex items-center border-2 border-outline-variant font-mono">
            <button
              aria-label="Decrease quantity"
              className="px-4 py-3 text-on-surface-variant hover:text-secondary"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <span className="min-w-8 text-center font-bold">{String(qty).padStart(2, "0")}</span>
            <button
              aria-label="Increase quantity"
              className="px-4 py-3 text-on-surface-variant hover:text-secondary"
              onClick={() => setQty((q) => q + 1)}
            >
              +
            </button>
          </div>
        )}
        <button
          onClick={handleAdd}
          className="display glow-red flex-1 bg-primary px-6 py-3 text-lg text-on-primary transition-colors hover:bg-secondary"
        >
          {added ? "Added ✓" : "Add to Cart →"}
        </button>
      </div>
    </div>
  );
}
