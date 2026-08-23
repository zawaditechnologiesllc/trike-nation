import type { Metadata } from "next";
import Link from "next/link";
import { fetchProducts } from "@/lib/api";
import { sanitiseSearch } from "@shared/core/validation";
import ProductCard from "@/components/ProductCard";

export const metadata: Metadata = { title: "Search" };
export const revalidate = 60;

/**
 * Search across the catalogue.
 *
 * Matching happens here rather than in the database: the catalogue is small,
 * and it means a query can hit the name, tagline, description, engine size and
 * colours in one pass without a full-text index. The input is sanitised of
 * filter metacharacters regardless — it reaches the API on the category path.
 */
function score(haystacks: (string | null | undefined)[], terms: string[]): number {
  const text = haystacks.filter(Boolean).join(" ").toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (!text.includes(term)) return 0; // every term must appear somewhere
    // A hit in the name is worth more than one buried in the description.
    total += (haystacks[0] ?? "").toLowerCase().includes(term) ? 3 : 1;
  }
  return total;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = sanitiseSearch(params.q);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const products = query ? await fetchProducts() : [];
  const results = products
    .map((product) => ({
      product,
      score: score(
        [
          product.name,
          product.tagline,
          product.blurb,
          product.description,
          product.engineSize,
          (product.colors ?? []).map((c) => c.name).join(" "),
        ],
        terms,
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.product);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-12">
      <p className="label-caps text-on-secondary-fixed">Search</p>
      <h1 className="display mt-2 text-4xl md:text-5xl">
        {query ? <>Results for &ldquo;{query}&rdquo;</> : "Find your machine"}
      </h1>

      {/* Plain GET form, so a search is a shareable URL and works without JS. */}
      <form action="/search" method="get" className="mt-8 flex max-w-xl gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Try 'drift', '212cc', 'black'…"
          className="input-tech flex-1"
          aria-label="Search products"
        />
        <button type="submit" className="display glow-red bg-primary px-6 text-on-primary hover:bg-secondary">
          Search
        </button>
      </form>

      {query && (
        <p className="label-caps mt-6 text-on-surface-muted">
          {results.length} match{results.length === 1 ? "" : "es"}
        </p>
      )}

      {query && results.length === 0 ? (
        <div className="mt-8 border border-outline bg-surface-container p-12 text-center">
          <p className="display text-2xl text-on-surface-muted">Nothing matched that</p>
          <p className="mt-2 font-mono text-sm text-on-surface-muted">
            Try a shorter query, or browse the full fleet.
          </p>
          <Link href="/shop" className="display glow-red mt-6 inline-block bg-primary px-6 py-2 text-on-primary hover:bg-secondary">
            Shop All
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
