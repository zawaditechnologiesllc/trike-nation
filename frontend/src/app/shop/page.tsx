import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { fetchCategories, fetchProducts } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import ShopFilters from "@/components/ShopFilters";
import SpecList from "@/components/SpecList";

export const metadata: Metadata = {
  title: "Shop",
  description: "Handcrafted engineering for adrenaline junkies — drift karts, mini trikes, mini bikes, and quads.",
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; engine?: string; max?: string }>;
}) {
  const params = await searchParams;
  const [products, categories] = await Promise.all([
    fetchProducts({ category: params.category }),
    fetchCategories(),
  ]);

  const maxCents = params.max ? Number(params.max) * 100 : Infinity;
  const filtered = products.filter(
    (p) => p.priceCents <= maxCents && (!params.engine || p.engineSize === params.engine),
  );
  const activeCategory = categories.find((c) => c.slug === params.category);

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
          <ShopFilters categories={categories} />
        </Suspense>

        <div>
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
