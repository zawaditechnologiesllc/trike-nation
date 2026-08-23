import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { fetchCategories, fetchProducts } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import ShopFilters from "@/components/ShopFilters";
import { derivePriceBands, parsePriceRange, withinRange } from "@shared/core/price-bands";
import SpecList from "@/components/SpecList";

export const metadata: Metadata = {
  title: "Shop",
  description: "Handcrafted engineering for adrenaline junkies — drift karts, mini trikes, mini bikes, and quads.",
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    engine?: string;
    band?: string;
    min?: string;
    max?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const [all, categories] = await Promise.all([fetchProducts(), fetchCategories()]);

  // Every filter option below is derived from what is actually in the
  // catalogue right now, and carries its own count. A band or an engine size
  // with nothing behind it is never offered.
  const inCategory = params.category ? all.filter((p) => p.category === params.category) : all;

  const bands = derivePriceBands(inCategory.map((p) => p.priceCents));
  const engines = [...new Set(inCategory.map((p) => p.engineSize))]
    .filter((value) => value && value !== "N/A")
    .map((value) => ({ value, count: inCategory.filter((p) => p.engineSize === value).length }))
    .sort((a, b) => a.value.localeCompare(b.value));

  // A band from the sidebar, or a min/max typed into the plain GET form.
  const bandRange = params.band
    ? (() => {
        const [min, max] = params.band!.split("-");
        return { minCents: Number(min) || 0, maxCents: max ? Number(max) : null };
      })()
    : null;
  const typedRange = parsePriceRange(params.min, params.max);
  const range = bandRange ?? typedRange;

  let filtered = inCategory.filter(
    (p) => withinRange(p.priceCents, range) && (!params.engine || p.engineSize === params.engine),
  );

  if (params.sort === "price-asc") filtered = [...filtered].sort((a, b) => a.priceCents - b.priceCents);
  else if (params.sort === "price-desc") filtered = [...filtered].sort((a, b) => b.priceCents - a.priceCents);
  else if (params.sort === "newest") filtered = [...filtered].sort((a, b) => Number(b.isNew) - Number(a.isNew));

  const activeCategory = categories.find((c) => c.slug === params.category);
  const categoriesWithCounts = categories.map((c) => ({
    ...c,
    liveCount: all.filter((p) => p.category === c.slug).length,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-12">
      <h1 className="display text-4xl text-blush md:text-6xl">
        {activeCategory ? activeCategory.name : "Black Friday Madness"}
      </h1>
      <p className="label-caps mt-3 text-silver">
        {activeCategory?.tagline ?? "Handcrafted engineering for adrenaline junkies"}
      </p>

      <div className="mt-12 grid gap-12 lg:grid-cols-[240px_1fr]">
        <Suspense>
          <ShopFilters
            categories={categoriesWithCounts}
            bands={bands}
            engines={engines}
            totalCount={all.length}
          />
        </Suspense>

        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="label-caps text-on-surface-muted">
              {filtered.length} machine{filtered.length === 1 ? "" : "s"}
            </p>
            {/* A GET form again, so the sort is part of the shareable URL. */}
            <form action="/shop" method="get" className="flex items-center gap-2">
              {params.category && <input type="hidden" name="category" value={params.category} />}
              {params.engine && <input type="hidden" name="engine" value={params.engine} />}
              {params.band && <input type="hidden" name="band" value={params.band} />}
              {params.min && <input type="hidden" name="min" value={params.min} />}
              {params.max && <input type="hidden" name="max" value={params.max} />}
              <label className="label-caps text-on-surface-muted" htmlFor="sort">
                Sort
              </label>
              <select id="sort" name="sort" defaultValue={params.sort ?? ""} className="input-tech w-auto">
                <option value="">Featured</option>
                <option value="newest">Newest</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
              </select>
              <button type="submit" className="label-caps border border-outline-variant px-3 py-2 text-on-surface-variant hover:border-secondary hover:text-secondary">
                Apply
              </button>
            </form>
          </div>

          {filtered.length === 0 ? (
            <div className="border border-steel bg-carbon p-12 text-center">
              <p className="display text-2xl text-silver">No machines match those filters</p>
              <p className="mt-2 font-mono text-sm text-silver">Loosen the throttle and try again.</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {filtered.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          )}

          {/* Engineering excellence */}
          <div className="dotted-panel mt-16 grid items-center gap-10 border border-steel bg-carbon p-8 md:grid-cols-2 md:p-12">
            <div>
              <p className="label-caps text-blush">Engineering Excellence</p>
              <h2 className="display mt-3 text-3xl md:text-4xl">
                The Joy of <span className="text-ember">Adrenaline</span>
              </h2>
              <p className="mt-4 leading-relaxed text-silver">
                Every machine that leaves Go Cart Grip is over-engineered for durability. We combine
                high-output 4-stroke engines with precision-welded frames for the ultimate ride.
              </p>
              <div className="mt-8">
                <SpecList
                  specs={[
                    { label: "Frame Grade", value: "Chromoly Steel" },
                    { label: "Max Torque", value: "13.5 Nm @ 2500RPM" },
                    { label: "Drive System", value: "Centrifugal Clutch" },
                  ]}
                />
              </div>
            </div>
            <Image
              src="/images/engine-detail.svg"
              alt="High-output 4-stroke engine"
              width={800}
              height={450}
              className="border-2 border-offwhite/20"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
