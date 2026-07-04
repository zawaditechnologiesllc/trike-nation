"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin";
import { fetchProducts } from "@/lib/api";
import { money } from "@/lib/format";
import type { Product } from "@/lib/types";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState("");

  function load() {
    fetchProducts().then(setProducts).catch(() => setProducts([]));
  }
  useEffect(load, []);

  async function toggle(product: Product, field: "featured" | "inStock") {
    try {
      await adminFetch(`/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: !product[field] }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function remove(product: Product) {
    if (!window.confirm(`Delete "${product.name}" permanently?`)) return;
    try {
      await adminFetch(`/products/${product.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-3xl md:text-4xl">Products</h1>
        <Link href="/admin/products/new" className="display glow-red bg-crimson px-6 py-2 text-offwhite hover:bg-ember">
          + New Product
        </Link>
      </div>

      {error && <p className="mt-4 font-mono text-sm text-ember">{error}</p>}
      {!products && <p className="label-caps mt-6 text-silver">Loading products…</p>}
      {products && (
        <div className="mt-6 space-y-3">
          {products.map((p) => (
            <div key={p.slug} className="flex flex-wrap items-center gap-4 border border-steel bg-carbon p-4">
              <Image src={p.image} alt="" width={96} height={54} className="border border-steel" unoptimized />
              <div className="min-w-0 flex-1">
                <p className="display truncate text-lg">{p.name}</p>
                <p className="font-mono text-xs text-silver">
                  {p.category} · {money(p.priceCents)}
                  {p.compareAtCents ? ` (was ${money(p.compareAtCents)})` : ""}
                </p>
              </div>
              <button
                onClick={() => toggle(p, "featured")}
                className={`label-caps border px-3 py-1.5 ${p.featured ? "border-crimson text-ember" : "border-steel text-silver"}`}
              >
                {p.featured ? "Featured" : "Not featured"}
              </button>
              <button
                onClick={() => toggle(p, "inStock")}
                className={`label-caps border px-3 py-1.5 ${p.inStock ? "border-steel text-success" : "border-crimson text-ember"}`}
              >
                {p.inStock ? "In stock" : "Out of stock"}
              </button>
              <Link href={`/admin/products/${p.id}`} className="label-caps text-ember hover:text-blush">
                Edit
              </Link>
              <button onClick={() => remove(p)} className="label-caps text-silver hover:text-ember">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
