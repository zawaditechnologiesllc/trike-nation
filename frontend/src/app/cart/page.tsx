"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";

export default function CartPage() {
  const { items, subtotalCents, setQty, remove } = useCart();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-12">
      <h1 className="display text-4xl text-blush md:text-6xl">Your Garage</h1>
      <p className="label-caps mt-3 text-silver">
        {items.length ? `${items.length} machine${items.length > 1 ? "s" : ""} staged for checkout` : "Empty bay"}
      </p>

      {items.length === 0 ? (
        <div className="mt-12 border border-steel bg-carbon p-16 text-center">
          <p className="display text-2xl text-silver">Your cart is empty</p>
          <Link
            href="/shop"
            className="display glow-red mt-6 inline-block bg-crimson px-8 py-3 text-offwhite hover:bg-ember"
          >
            Shop the Fleet
          </Link>
        </div>
      ) : (
        <div className="mt-12 space-y-4">
          {items.map((item) => (
            <div
              key={item.slug}
              className="flex flex-col gap-4 border border-steel bg-carbon p-4 sm:flex-row sm:items-center"
            >
              <Image src={item.image} alt={item.name} width={160} height={90} className="border border-steel" />
              <div className="flex-1">
                <Link href={`/products/${item.slug}`} className="display text-lg hover:text-blush">
                  {item.name}
                </Link>
                <p className="mt-1 font-mono text-sm text-ember">{money(item.priceCents)}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center border border-steel-light font-mono">
                  <button
                    aria-label="Decrease quantity"
                    className="px-3 py-2 text-chrome hover:text-ember"
                    onClick={() => setQty(item.slug, item.qty - 1)}
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center font-bold">{String(item.qty).padStart(2, "0")}</span>
                  <button
                    aria-label="Increase quantity"
                    className="px-3 py-2 text-chrome hover:text-ember"
                    onClick={() => setQty(item.slug, item.qty + 1)}
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => remove(item.slug)}
                  className="label-caps text-silver hover:text-ember"
                  aria-label={`Remove ${item.name}`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          <div className="flex flex-col items-end gap-4 border-t-2 border-crimson pt-6">
            <p className="font-mono text-lg">
              Subtotal: <span className="font-bold text-ember">{money(subtotalCents)}</span>
            </p>
            <p className="label-caps text-silver">Shipping free · Discounts applied at checkout</p>
            <Link
              href="/checkout"
              className="display glow-red bg-crimson px-10 py-4 text-lg text-offwhite hover:bg-ember"
            >
              Proceed to Checkout →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
