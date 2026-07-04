"use client";

import { use, useEffect, useState } from "react";
import ProductForm from "@/components/admin/ProductForm";
import { fetchProducts } from "@/lib/api";
import type { Product } from "@/lib/types";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<Product | null | undefined>(undefined);

  useEffect(() => {
    fetchProducts().then((all) => setProduct(all.find((p) => p.id === id) ?? null));
  }, [id]);

  if (product === undefined) return <p className="label-caps text-silver">Loading product…</p>;
  if (product === null) return <p className="font-mono text-sm text-ember">Product not found.</p>;

  return (
    <div>
      <h1 className="display text-3xl md:text-4xl">Edit Product</h1>
      <p className="mt-2 font-mono text-xs text-silver">/{product.slug}</p>
      <div className="mt-8">
        <ProductForm product={product} />
      </div>
    </div>
  );
}
