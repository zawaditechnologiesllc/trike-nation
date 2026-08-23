"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";

/**
 * Slide-over cart. The full /cart page still exists — this is for the "added
 * something, want to keep shopping" case, which is most of them.
 */
export default function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, subtotalCents, setQty, remove } = useCart();

  // Escape closes it, and the page behind must not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Cart">
      <button
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-label="Close cart"
        tabIndex={-1}
      />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-outline bg-surface-container-lowest">
        <div className="flex items-center justify-between border-b border-outline px-6 py-5">
          <p className="display text-2xl">Your Build</p>
          <button onClick={onClose} className="label-caps text-on-surface-muted hover:text-secondary">
            Close
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-on-surface-muted">Nothing staged yet.</p>
            <Link href="/shop" onClick={onClose} className="display glow-red bg-primary px-6 py-2 text-on-primary hover:bg-secondary">
              Shop the Fleet
            </Link>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {items.map((item) => (
                <div key={item.key} className="flex gap-4 border-b border-outline/60 pb-4">
                  <Image src={item.image} alt={item.name} width={80} height={45} className="h-fit border border-outline" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${item.slug}`} onClick={onClose} className="text-sm font-bold hover:text-secondary">
                      {item.name}
                    </Link>
                    {item.color && <p className="mt-0.5 font-mono text-xs text-on-secondary-fixed">{item.color}</p>}
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center border border-outline-variant font-mono text-xs">
                        <button onClick={() => setQty(item.key, item.qty - 1)} className="px-2 py-1 text-on-surface-variant hover:text-secondary" aria-label="Decrease quantity">
                          −
                        </button>
                        <span className="min-w-6 text-center">{item.qty}</span>
                        <button onClick={() => setQty(item.key, item.qty + 1)} className="px-2 py-1 text-on-surface-variant hover:text-secondary" aria-label="Increase quantity">
                          +
                        </button>
                      </div>
                      <button onClick={() => remove(item.key)} className="label-caps text-on-surface-muted hover:text-error">
                        Remove
                      </button>
                    </div>
                  </div>
                  <p className="font-mono text-sm font-bold text-secondary">{money(item.priceCents * item.qty)}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-outline px-6 py-5">
              <div className="flex items-baseline justify-between">
                <span className="label-caps text-on-surface-muted">Subtotal</span>
                <span className="font-mono text-xl font-bold text-secondary">{money(subtotalCents)}</span>
              </div>
              <p className="mt-1 font-mono text-xs text-on-surface-muted">Free worldwide shipping.</p>
              <Link
                href="/checkout"
                onClick={onClose}
                className="display glow-red mt-4 block bg-primary py-3 text-center text-lg text-on-primary hover:bg-secondary"
              >
                Checkout →
              </Link>
              <Link href="/cart" onClick={onClose} className="label-caps mt-3 block text-center text-on-surface-muted hover:text-secondary">
                View full cart
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
