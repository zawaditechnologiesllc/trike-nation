import { fetchCategories, fetchProducts } from "@/lib/api";
import { BRAND } from "@/lib/brand";

/**
 * Sitemap, built from the live catalogue.
 *
 * A brand-new domain has almost no inbound links, so this is the only way to
 * tell a search engine "here is everything". It must therefore never 500: an
 * unreachable API degrades to the static pages rather than taking the sitemap
 * down with it.
 */
export const revalidate = 3600;

const STATIC_PATHS = [
  { path: "", priority: "1.0", changefreq: "daily" },
  { path: "/shop", priority: "0.9", changefreq: "daily" },
  { path: "/about", priority: "0.5", changefreq: "monthly" },
  { path: "/contact", priority: "0.6", changefreq: "monthly" },
  { path: "/faq", priority: "0.5", changefreq: "monthly" },
  { path: "/shipping", priority: "0.6", changefreq: "monthly" },
  { path: "/warranty", priority: "0.5", changefreq: "monthly" },
  { path: "/support", priority: "0.5", changefreq: "monthly" },
  { path: "/privacy", priority: "0.3", changefreq: "yearly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
  { path: "/cookies", priority: "0.3", changefreq: "yearly" },
];

function urlEntry(loc: string, priority: string, changefreq: string): string {
  return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

export async function GET() {
  const entries = STATIC_PATHS.map((p) => urlEntry(`${BRAND.url}${p.path}`, p.priority, p.changefreq));

  // Fail safe: the catalogue is a bonus here, not a dependency.
  try {
    const [products, categories] = await Promise.all([fetchProducts(), fetchCategories()]);
    for (const category of categories) {
      entries.push(urlEntry(`${BRAND.url}/shop?category=${category.slug}`, "0.7", "weekly"));
    }
    for (const product of products) {
      entries.push(urlEntry(`${BRAND.url}/products/${product.slug}`, "0.8", "weekly"));
    }
  } catch {
    // Static pages still ship.
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
