"use client";

import ProductForm from "@/components/admin/ProductForm";

export default function NewProductPage() {
  return (
    <div>
      <h1 className="display text-3xl md:text-4xl">New Product</h1>
      <div className="mt-8">
        <ProductForm />
      </div>
    </div>
  );
}
