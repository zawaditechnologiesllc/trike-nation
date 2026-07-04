"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { Category } from "@/lib/types";

const ENGINE_SIZES = ["200CC", "212CC", "400CC", "ELECTRIC"];
const PRICE_MIN = 500;
const PRICE_MAX = 3000;

export default function ShopFilters({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const category = params.get("category") ?? "";
  const engine = params.get("engine") ?? "";
  const max = Number(params.get("max") ?? PRICE_MAX);

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value && next.get(key) !== value) next.set(key, value);
      else next.delete(key);
      router.push(`/shop${next.size ? `?${next}` : ""}`, { scroll: false });
    },
    [params, router],
  );

  return (
    <aside className="space-y-10">
      <div>
        <p className="label-caps border-l-4 border-crimson pl-3 text-blush">Category</p>
        <ul className="mt-4 space-y-1">
          <li>
            <button
              onClick={() => setParam("category", "")}
              className={`flex w-full justify-between py-1.5 text-sm font-semibold ${!category ? "text-ember" : "text-chrome hover:text-ember"}`}
            >
              All Machines
            </button>
          </li>
          {categories.map((cat) => (
            <li key={cat.slug}>
              <button
                onClick={() => setParam("category", cat.slug)}
                className={`flex w-full justify-between py-1.5 text-sm font-semibold ${
                  category === cat.slug ? "text-ember" : "text-chrome hover:text-ember"
                }`}
              >
                <span>{cat.name}</span>
                <span className="font-mono text-xs text-silver">{String(cat.count).padStart(2, "0")}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="label-caps border-l-4 border-crimson pl-3 text-blush">Price Range</p>
        <input
          type="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={50}
          value={max}
          onChange={(e) => setParam("max", e.target.value === String(PRICE_MAX) ? "" : e.target.value)}
          className="mt-4 w-full accent-crimson"
          aria-label="Maximum price"
        />
        <div className="mt-1 flex justify-between font-mono text-xs text-silver">
          <span>${PRICE_MIN}</span>
          <span className="text-ember">up to ${max.toLocaleString()}</span>
        </div>
      </div>

      <div>
        <p className="label-caps border-l-4 border-crimson pl-3 text-blush">Engine Size</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {ENGINE_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => setParam("engine", engine === size ? "" : size)}
              className={`label-caps border px-3 py-2 transition-colors ${
                engine === size
                  ? "border-crimson bg-crimson text-offwhite"
                  : "border-steel bg-carbon text-chrome hover:border-crimson"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-steel bg-carbon p-5">
        <p className="label-caps text-silver">Limited Coupon</p>
        <p className="display mt-2 text-xl text-offwhite">10% Off Extra</p>
        <p className="mt-3 border-2 border-dashed border-crimson px-3 py-2 text-center font-mono text-sm font-bold tracking-widest text-blush">
          BIKEMIKE26
        </p>
      </div>
    </aside>
  );
}
