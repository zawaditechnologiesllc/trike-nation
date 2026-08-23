"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PriceBand } from "@shared/core/price-bands";
import type { Category } from "@/lib/types";

/**
 * Shop filters.
 *
 * Every option here is DERIVED from the live catalogue and carries its own
 * count. Hard-coded bands and a hard-coded engine list become links to an
 * empty grid the moment the catalogue moves — and a filter that leads
 * nowhere is worse than no filter.
 *
 * The min/max box is a plain GET form, so the result is a shareable URL that
 * works with JavaScript switched off. The links are real links for the same
 * reason.
 */
export default function ShopFilters({
  categories,
  bands,
  engines,
  totalCount,
}: {
  categories: (Category & { liveCount: number })[];
  bands: PriceBand[];
  engines: { value: string; count: number }[];
  totalCount: number;
}) {
  const params = useSearchParams();
  const category = params.get("category") ?? "";
  const engine = params.get("engine") ?? "";
  const activeBand = params.get("band") ?? "";
  const sort = params.get("sort") ?? "";

  /** Builds a URL with one parameter changed, dropping it when empty. */
  function href(changes: Record<string, string>): string {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // A new filter should return to the first page of results.
    next.delete("min");
    next.delete("max");
    return `/shop${next.size ? `?${next}` : ""}`;
  }

  const linkClass = (active: boolean) =>
    `flex w-full justify-between py-1.5 text-sm font-semibold ${
      active ? "text-secondary" : "text-on-surface-variant hover:text-secondary"
    }`;

  return (
    <aside className="space-y-10">
      <div>
        <p className="label-caps border-l-4 border-primary pl-3 text-on-secondary-fixed">Category</p>
        <ul className="mt-4 space-y-1">
          <li>
            <Link href={href({ category: "" })} className={linkClass(!category)}>
              <span>All Machines</span>
              <span className="font-mono text-xs text-on-surface-muted">{totalCount}</span>
            </Link>
          </li>
          {categories.map((cat) => (
            <li key={cat.slug}>
              <Link href={href({ category: cat.slug })} className={linkClass(category === cat.slug)}>
                <span>{cat.name}</span>
                {/* The LIVE count, not the seeded one — a category showing 12
                    that opens onto 3 products is a broken promise. */}
                <span className="font-mono text-xs text-on-surface-muted">{cat.liveCount}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {bands.length > 1 && (
        <div>
          <p className="label-caps border-l-4 border-primary pl-3 text-on-secondary-fixed">Price</p>
          <ul className="mt-4 space-y-1">
            {bands.map((band) => {
              const value = `${band.min}-${band.max ?? ""}`;
              return (
                <li key={value}>
                  <Link href={href({ band: activeBand === value ? "" : value })} className={linkClass(activeBand === value)}>
                    <span>{band.label}</span>
                    <span className="font-mono text-xs text-on-surface-muted">{band.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Plain GET form: the result is a URL somebody can share, and it
              works with JavaScript off. */}
          <form action="/shop" method="get" className="mt-4 flex items-end gap-2">
            {category && <input type="hidden" name="category" value={category} />}
            {engine && <input type="hidden" name="engine" value={engine} />}
            {sort && <input type="hidden" name="sort" value={sort} />}
            <label className="block flex-1">
              <span className="label-caps text-on-surface-muted">Min $</span>
              <input name="min" inputMode="decimal" defaultValue={params.get("min") ?? ""} className="input-tech mt-1" />
            </label>
            <label className="block flex-1">
              <span className="label-caps text-on-surface-muted">Max $</span>
              <input name="max" inputMode="decimal" defaultValue={params.get("max") ?? ""} className="input-tech mt-1" />
            </label>
            <button type="submit" className="label-caps border border-outline-variant px-3 py-2.5 text-on-surface-variant hover:border-secondary hover:text-secondary">
              Go
            </button>
          </form>
        </div>
      )}

      {engines.length > 1 && (
        <div>
          <p className="label-caps border-l-4 border-primary pl-3 text-on-secondary-fixed">Engine Size</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {engines.map((option) => (
              <Link
                key={option.value}
                href={href({ engine: engine === option.value ? "" : option.value })}
                className={`label-caps border px-3 py-2 text-center transition-colors ${
                  engine === option.value
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline bg-surface-container text-on-surface-variant hover:border-primary"
                }`}
              >
                {option.value}
                <span className="ml-1 text-[10px] opacity-70">{option.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="border border-outline bg-surface-container p-5">
        <p className="label-caps text-on-surface-muted">Limited Coupon</p>
        <p className="display mt-2 text-xl text-on-surface">10% Off Extra</p>
        <p className="mt-3 border-2 border-dashed border-primary px-3 py-2 text-center font-mono text-sm font-bold tracking-widest text-on-secondary-fixed">
          BIKEMIKE26
        </p>
      </div>
    </aside>
  );
}
