"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { adminFetch, uploadImage } from "@/lib/admin";
import { fetchCategories } from "@/lib/api";
import type { Category, Product } from "@/lib/types";

const ENGINE_SIZES = ["200CC", "212CC", "400CC", "ELECTRIC", "N/A"];

const EMPTY: Product = {
  slug: "",
  name: "",
  category: "",
  priceCents: 0,
  compareAtCents: undefined,
  badges: [],
  blurb: "",
  description: "",
  engineSize: "200CC",
  specs: [],
  boxContents: [],
  features: [],
  image: "",
  featured: false,
  inStock: true,
};

export default function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const [form, setForm] = useState<Product>(product ?? EMPTY);
  const [categories, setCategories] = useState<Category[]>([]);
  const [price, setPrice] = useState(product ? String(product.priceCents / 100) : "");
  const [compareAt, setCompareAt] = useState(
    product?.compareAtCents ? String(product.compareAtCents / 100) : "",
  );
  const [badges, setBadges] = useState(product?.badges.join(", ") ?? "");
  const [box, setBox] = useState(product?.boxContents.join("\n") ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCategories().then((cats) => {
      setCategories(cats);
      setForm((f) => (f.category ? f : { ...f, category: cats[0]?.slug ?? "" }));
    });
  }, []);

  function patch(fields: Partial<Product>) {
    setForm((f) => ({ ...f, ...fields }));
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadImage(file);
      patch({ image: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      priceCents: Math.round(Number(price) * 100),
      compareAtCents: compareAt ? Math.round(Number(compareAt) * 100) : null,
      badges: badges.split(",").map((b) => b.trim().toUpperCase()).filter(Boolean),
      boxContents: box.split("\n").map((l) => l.trim()).filter(Boolean),
      specs: form.specs.filter((s) => s.label.trim() && s.value.trim()),
      features: form.features.filter((f) => f.title.trim()),
    };
    try {
      if (product?.id) {
        await adminFetch(`/products/${product.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await adminFetch("/products", { method: "POST", body: JSON.stringify(payload) });
      }
      router.push("/admin/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <div className="grid gap-6 border border-steel bg-carbon p-6 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="label-caps text-silver">Name *</span>
          <input required className="input-tech mt-2" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label className="block">
          <span className="label-caps text-silver">Category *</span>
          <select required className="input-tech mt-2" value={form.category} onChange={(e) => patch({ category: e.target.value })}>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label-caps text-silver">Engine Size</span>
          <select className="input-tech mt-2" value={form.engineSize} onChange={(e) => patch({ engineSize: e.target.value as Product["engineSize"] })}>
            {ENGINE_SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label-caps text-silver">Price (USD) *</span>
          <input required type="number" min="0" step="0.01" className="input-tech mt-2" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="block">
          <span className="label-caps text-silver">Compare-at Price (optional)</span>
          <input type="number" min="0" step="0.01" className="input-tech mt-2" value={compareAt} onChange={(e) => setCompareAt(e.target.value)} />
        </label>
        <label className="block">
          <span className="label-caps text-silver">Badges (comma-separated)</span>
          <input className="input-tech mt-2" placeholder="SALE, SPECIAL EDITION" value={badges} onChange={(e) => setBadges(e.target.value)} />
        </label>
        <label className="block">
          <span className="label-caps text-silver">Card Blurb</span>
          <input className="input-tech mt-2" placeholder="Custom Build • Worldwide Ship" value={form.blurb} onChange={(e) => patch({ blurb: e.target.value })} />
        </label>
        <label className="block sm:col-span-2">
          <span className="label-caps text-silver">Description</span>
          <textarea rows={3} className="input-tech mt-2 resize-y" value={form.description} onChange={(e) => patch({ description: e.target.value })} />
        </label>
        <div className="flex gap-6 sm:col-span-2">
          <label className="label-caps flex items-center gap-2 text-chrome">
            <input type="checkbox" checked={form.featured} onChange={(e) => patch({ featured: e.target.checked })} className="accent-crimson" />
            Featured on homepage
          </label>
          <label className="label-caps flex items-center gap-2 text-chrome">
            <input type="checkbox" checked={form.inStock} onChange={(e) => patch({ inStock: e.target.checked })} className="accent-crimson" />
            In stock
          </label>
        </div>
      </div>

      {/* Image */}
      <div className="border border-steel bg-carbon p-6">
        <p className="label-caps text-silver">Product Image</p>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          {form.image && (
            <Image src={form.image} alt="Product" width={240} height={135} className="border border-steel" unoptimized />
          )}
          <div className="space-y-3">
            <label className="display inline-block cursor-pointer border-2 border-chrome px-5 py-2 text-sm text-chrome hover:border-ember hover:text-ember">
              {uploading ? "Uploading…" : "Upload Image"}
              <input type="file" accept="image/*" className="hidden" onChange={onUpload} disabled={uploading} />
            </label>
            <input
              className="input-tech"
              placeholder="…or paste an image URL"
              value={form.image}
              onChange={(e) => patch({ image: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Specs */}
      <div className="border border-steel bg-carbon p-6">
        <div className="flex items-center justify-between">
          <p className="label-caps text-silver">Technical Specs</p>
          <button type="button" onClick={() => patch({ specs: [...form.specs, { label: "", value: "" }] })} className="label-caps text-ember hover:text-blush">
            + Add Spec
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {form.specs.map((spec, i) => (
            <div key={i} className="flex gap-3">
              <input
                className="input-tech flex-1"
                placeholder="Engine Type"
                value={spec.label}
                onChange={(e) => patch({ specs: form.specs.map((s, j) => (j === i ? { ...s, label: e.target.value } : s)) })}
              />
              <input
                className="input-tech flex-1"
                placeholder="200cc 6.5HP 4-Stroke"
                value={spec.value}
                onChange={(e) => patch({ specs: form.specs.map((s, j) => (j === i ? { ...s, value: e.target.value } : s)) })}
              />
              <button type="button" onClick={() => patch({ specs: form.specs.filter((_, j) => j !== i) })} className="label-caps text-silver hover:text-ember">
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Features + box contents */}
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="border border-steel bg-carbon p-6">
          <div className="flex items-center justify-between">
            <p className="label-caps text-silver">Selling Points</p>
            <button type="button" onClick={() => patch({ features: [...form.features, { title: "", text: "" }] })} className="label-caps text-ember hover:text-blush">
              + Add
            </button>
          </div>
          <div className="mt-4 space-y-4">
            {form.features.map((feature, i) => (
              <div key={i} className="space-y-2 border-b border-steel/60 pb-4">
                <div className="flex gap-3">
                  <input
                    className="input-tech flex-1"
                    placeholder="Handcrafted Precision"
                    value={feature.title}
                    onChange={(e) => patch({ features: form.features.map((f, j) => (j === i ? { ...f, title: e.target.value } : f)) })}
                  />
                  <button type="button" onClick={() => patch({ features: form.features.filter((_, j) => j !== i) })} className="label-caps text-silver hover:text-ember">
                    ✕
                  </button>
                </div>
                <input
                  className="input-tech"
                  placeholder="One-line supporting detail"
                  value={feature.text}
                  onChange={(e) => patch({ features: form.features.map((f, j) => (j === i ? { ...f, text: e.target.value } : f)) })}
                />
              </div>
            ))}
          </div>
        </div>
        <label className="block border border-steel bg-carbon p-6">
          <span className="label-caps text-silver">What&apos;s in the Box (one item per line)</span>
          <textarea rows={8} className="input-tech mt-4 resize-y" value={box} onChange={(e) => setBox(e.target.value)} />
        </label>
      </div>

      {error && <p className="border border-crimson bg-crimson/10 p-4 font-mono text-sm text-ember">{error}</p>}
      <div className="flex gap-4">
        <button type="submit" disabled={saving || uploading} className="display glow-red bg-crimson px-10 py-3 text-lg text-offwhite hover:bg-ember disabled:opacity-50">
          {saving ? "Saving…" : product ? "Save Product" : "Create Product"}
        </button>
        <button type="button" onClick={() => router.push("/admin/products")} className="display border-2 border-steel-light px-8 py-3 text-chrome hover:border-ember hover:text-ember">
          Cancel
        </button>
      </div>
    </form>
  );
}
