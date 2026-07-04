"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin";
import { fetchCategories } from "@/lib/api";
import type { Category } from "@/lib/types";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchCategories().then(setCategories);
  }, []);

  function patch(slug: string, fields: Partial<Category>) {
    setCategories((cats) => cats.map((c) => (c.slug === slug ? { ...c, ...fields } : c)));
  }

  async function save(cat: Category) {
    setStatus((s) => ({ ...s, [cat.slug]: "saving" }));
    try {
      await adminFetch(`/categories/${cat.slug}`, {
        method: "PATCH",
        body: JSON.stringify({ name: cat.name, tagline: cat.tagline, badge: cat.badge ?? "", count: cat.count }),
      });
      setStatus((s) => ({ ...s, [cat.slug]: "saved" }));
    } catch (e) {
      setStatus((s) => ({ ...s, [cat.slug]: e instanceof Error ? e.message : "error" }));
    }
  }

  return (
    <div>
      <h1 className="display text-3xl md:text-4xl">Categories</h1>
      <p className="mt-2 font-mono text-xs text-silver">
        Names, taglines, and badges shown on the homepage fleet grid and shop filters.
      </p>
      <div className="mt-8 space-y-4">
        {categories.map((cat) => (
          <div key={cat.slug} className="grid gap-4 border border-steel bg-carbon p-5 sm:grid-cols-[1fr_1fr_140px_90px_auto]">
            <label className="block">
              <span className="label-caps text-silver">Name</span>
              <input className="input-tech mt-2" value={cat.name} onChange={(e) => patch(cat.slug, { name: e.target.value })} />
            </label>
            <label className="block">
              <span className="label-caps text-silver">Tagline</span>
              <input className="input-tech mt-2" value={cat.tagline} onChange={(e) => patch(cat.slug, { tagline: e.target.value })} />
            </label>
            <label className="block">
              <span className="label-caps text-silver">Badge</span>
              <input className="input-tech mt-2" placeholder="—" value={cat.badge ?? ""} onChange={(e) => patch(cat.slug, { badge: e.target.value })} />
            </label>
            <label className="block">
              <span className="label-caps text-silver">Count</span>
              <input type="number" className="input-tech mt-2" value={cat.count} onChange={(e) => patch(cat.slug, { count: Number(e.target.value) })} />
            </label>
            <div className="flex items-end gap-3">
              <button onClick={() => save(cat)} className="display border-2 border-chrome px-5 py-2.5 text-sm text-chrome hover:border-ember hover:text-ember">
                Save
              </button>
              {status[cat.slug] && (
                <span className={`label-caps pb-3 ${status[cat.slug] === "saved" ? "text-success" : "text-silver"}`}>
                  {status[cat.slug]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
