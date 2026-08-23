import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchCategories, fetchProduct, fetchProducts, fetchSettings, fetchTestimonials } from "@/lib/api";
import { money } from "@/lib/format";
import AddToCartButton from "@/components/AddToCartButton";
import Badge from "@/components/Badge";
import Price from "@/components/Price";
import SpecList from "@/components/SpecList";
import Stars from "@/components/Stars";
import ProductCard from "@/components/ProductCard";
import SpecSheetLink from "@/components/SpecSheetLink";
import WishlistButton from "@/components/WishlistButton";
import { colorsFromDescription, stripColorLines } from "@/shared/core/colors";
import { productJsonLd } from "@/shared/core/trust";
import JsonLd from "@/components/JsonLd";
import { BRAND } from "@/lib/brand";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) return { title: "Not Found" };
  return { title: product.name, description: product.description };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) notFound();

  const [all, testimonials, categories] = await Promise.all([
    fetchProducts(),
    fetchTestimonials(),
    fetchCategories(),
  ]);
  const related = all.filter((p) => p.slug !== product.slug).slice(0, 4);

  // Colours come from the column, falling back to the description for products
  // uploaded before that column existed. The server applies the same fallback
  // when an order arrives, so what the buyer sees is what gets validated.
  const colors = product.colors?.length ? product.colors : colorsFromDescription(product.description);
  const productWithColors = { ...product, colors };
  // The colour lines are rendered as swatches below, so showing them again as
  // raw text is duplication the admin never asked for.
  const descriptionText = colors.length ? stripColorLines(product.description) : product.description;
  const settings = await fetchSettings();
  const category = categories.find((c) => c.slug === product.category);
  const savings =
    product.compareAtCents && product.compareAtCents > product.priceCents
      ? product.compareAtCents - product.priceCents
      : 0;

  return (
    <div>
      <JsonLd
        data={productJsonLd(
          {
            name: product.name,
            slug: product.slug,
            description: product.description,
            image: product.image?.startsWith("http") ? product.image : `${BRAND.url}${product.image}`,
            priceCents: product.priceCents,
            currency: "usd",
            inStock: product.inStock,
            colors,
          },
          {
            name: BRAND.name,
            legalName: settings.legalName,
            url: BRAND.url,
            description: product.blurb,
            email: settings.contact.email,
            phone: settings.contact.phone,
            address: settings.contact.address,
            social: settings.social,
          },
        )}
      />
      {/* Purchase panel */}
      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-12 md:px-12 lg:grid-cols-2">
        <div>
          <div className="relative border border-steel">
            <Image
              src={product.image}
              alt={product.name}
              width={800}
              height={450}
              priority
              className="w-full"
            />
            <div className="absolute left-4 top-4 flex gap-2">
              {product.badges.map((badge) => (
                <Badge key={badge}>{badge}</Badge>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {related.slice(0, 2).map((p) => (
              <Image
                key={p.slug}
                src={p.image}
                alt={p.name}
                width={800}
                height={450}
                className="border border-steel opacity-70 transition-opacity hover:opacity-100"
              />
            ))}
          </div>
        </div>

        <div>
          <p className="label-caps text-ember">
            <Link href="/shop" className="hover:text-blush">
              Shop
            </Link>
            {" / "}
            <Link href={`/shop?category=${product.category}`} className="hover:text-blush">
              {category?.name ?? product.category}
            </Link>
          </p>
          <h1 className="display mt-3 text-4xl leading-tight md:text-5xl">{product.name}</h1>
          <div className="mt-4 flex items-center gap-3">
            <Price priceCents={product.priceCents} compareAtCents={product.compareAtCents} size="lg" />
            {savings > 0 && <Badge tone="steel">Save {money(savings)}</Badge>}
          </div>

          <p className="mt-6 leading-relaxed text-chrome">{descriptionText}</p>

          <div className="mt-8 space-y-6 border-t border-steel pt-8">
            {product.features.map((feature) => (
              <div key={feature.title} className="flex gap-4">
                <span className="mt-1 h-2 w-2 shrink-0 rotate-45 bg-crimson" aria-hidden />
                <div>
                  <p className="label-caps text-blush">{feature.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-silver">{feature.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <AddToCartButton product={productWithColors} withQty withColors />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <WishlistButton product={product} />
              <SpecSheetLink slug={product.slug} />
            </div>
            <Link
              href="/contact"
              className="display mt-3 block border border-steel-light py-3 text-center text-sm text-chrome transition-colors hover:border-ember hover:text-ember"
            >
              Build Your Custom Trike
            </Link>
            <p className="label-caps mt-4 text-center text-silver">
              Shipping worldwide. Taxes calculated at checkout.
            </p>
          </div>
        </div>
      </section>

      {/* Mechanical Mastery */}
      <section className="border-y border-steel bg-coal">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 md:px-12 lg:grid-cols-[1fr_320px_320px]">
          <div>
            <h2 className="display text-3xl md:text-4xl">Mechanical Mastery</h2>
            <div className="mt-8">
              <SpecList specs={product.specs} />
            </div>
          </div>
          <div className="dotted-panel border border-steel bg-carbon p-6">
            <p className="label-caps text-blush">What&apos;s in the box</p>
            <ul className="mt-4 space-y-3">
              {product.boxContents.map((item) => (
                <li key={item} className="flex items-center gap-3 font-mono text-sm text-chrome">
                  <span className="text-success">✓</span> {item}
                </li>
              ))}
            </ul>
          </div>
          <Image
            src="/images/engine-detail.svg"
            alt="Engine detail"
            width={800}
            height={450}
            className="h-full border-2 border-offwhite/20 object-cover"
          />
        </div>
      </section>

      {/* Verified Feedback */}
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-12">
        <h2 className="display text-center text-3xl md:text-4xl">Verified Feedback</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {testimonials.slice(0, 3).map((t) => (
            <figure key={t.name} className="border border-steel bg-carbon p-6">
              <Stars rating={t.rating} />
              <blockquote className="mt-4 text-sm italic leading-relaxed text-chrome">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center bg-crimson font-mono text-xs font-bold text-offwhite">
                  {t.initials}
                </span>
                <span className="label-caps text-offwhite">{t.name}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Expand Your Garage */}
      <section className="border-t border-steel">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-12">
          <div className="flex items-end justify-between">
            <h2 className="display text-3xl md:text-4xl">Expand Your Garage</h2>
            <Link href="/shop" className="label-caps text-ember hover:text-blush">
              View All Shop →
            </Link>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
