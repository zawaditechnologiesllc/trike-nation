import Image from "next/image";
import Link from "next/link";
import { fetchCategories, fetchProducts, fetchSettings, fetchTestimonials } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import NewsletterForm from "@/components/NewsletterForm";
import Stars from "@/components/Stars";
import Badge from "@/components/Badge";

const VALUE_PROPS = [
  {
    title: "Free Shipping",
    text: "Delight in seamless free shipping, enhancing your shopping experience. Navigate our diverse collection where cost savings meet product joy.",
  },
  {
    title: "Secure Payments",
    text: "Shop with confidence using our secure payment methods. Your transactions are protected for a worry-free shopping experience.",
  },
  {
    title: "Order Tracking",
    text: "Track your order effortlessly with our streamlined system. Stay informed as your purchase makes its way to your doorstep.",
  },
  {
    title: "Easy Returns",
    text: "Celebrate worry-free shopping with our hassle-free returns — because we're here to make your experience as smooth as possible.",
  },
];

export default async function HomePage() {
  const [featured, categories, testimonials, settings] = await Promise.all([
    fetchProducts({ featured: true }),
    fetchCategories(),
    fetchTestimonials(),
    fetchSettings(),
  ]);
  const fleet = categories.filter((c) => c.slug !== "spare-parts");
  const { hero } = settings;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-steel">
        <Image
          src="/images/hero-garage.svg"
          alt=""
          fill
          priority
          className="object-cover opacity-40"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-24 md:px-12 md:py-36">
          <p className="label-caps text-blush">{hero.kicker}</p>
          <h1 className="display mt-4 max-w-3xl text-5xl leading-[0.95] md:text-8xl">
            {hero.title} <span className="text-ember">{hero.accent}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-chrome">{hero.subtitle}</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href={hero.primaryHref || "/shop"}
              className="display glow-red bg-crimson px-8 py-4 text-lg text-offwhite transition-colors hover:bg-ember"
            >
              {hero.primaryLabel}
            </Link>
            {hero.secondaryLabel && (
              <Link
                href={hero.secondaryHref || "/contact"}
                className="display border-2 border-chrome px-8 py-4 text-lg text-chrome transition-colors hover:border-ember hover:text-ember"
              >
                {hero.secondaryLabel}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Black Friday */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 md:grid-cols-2 md:px-12">
        <div>
          <p className="label-caps text-ember">Limited Time Offer</p>
          <h2 className="display mt-3 text-4xl md:text-5xl">
            Black Friday Madness <span className="text-ember">is Here!</span>
          </h2>
          <p className="mt-5 max-w-lg leading-relaxed text-silver">
            Grab your favorites before they&apos;re gone. You can trust us to bring you the latest
            designs at unbeatable prices. Don&apos;t miss this limited-time opportunity to upgrade
            your trike game.
          </p>
          <div className="mt-8 inline-block border-2 border-crimson p-6">
            <p className="display text-2xl text-blush">Up to 20% Off</p>
            <p className="label-caps mt-2 text-silver">Sitewide discounts applied at checkout</p>
          </div>
          <div className="mt-8">
            <Link
              href="/shop"
              className="display inline-block border-2 border-offwhite px-8 py-3 text-offwhite transition-colors hover:border-ember hover:text-ember"
            >
              Shop Deals Now
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Image
            src="/images/engine-detail.svg"
            alt="High-output 4-stroke engine"
            width={800}
            height={450}
            className="col-span-2 border border-steel"
          />
          <Image
            src="/images/product-drift-kart.svg"
            alt="Drift kart"
            width={800}
            height={450}
            className="border border-steel"
          />
          <Image
            src="/images/product-quad.svg"
            alt="Quad bike"
            width={800}
            height={450}
            className="border border-steel"
          />
        </div>
      </section>

      {/* Explore the Fleet */}
      <section className="border-y border-steel bg-coal">
        <div className="mx-auto max-w-7xl px-4 py-24 md:px-12">
          <h2 className="display text-center text-4xl md:text-5xl">
            Explore the <span className="text-ember">Fleet</span>
          </h2>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {fleet.map((cat) => (
              <Link
                key={cat.slug}
                href={`/shop?category=${cat.slug}`}
                className="group relative block overflow-hidden border border-steel"
              >
                <Image
                  src={cat.image}
                  alt={cat.name}
                  width={800}
                  height={450}
                  className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-night via-night/40 to-transparent p-6">
                  <div className="flex items-center gap-3">
                    <h3 className="display bg-crimson px-3 py-1 text-2xl text-offwhite">{cat.name}</h3>
                    {cat.badge && <Badge tone="steel">{cat.badge}</Badge>}
                  </div>
                  <p className="label-caps mt-3 text-chrome">{cat.tagline}</p>
                  <p className="label-caps mt-2 text-ember opacity-0 transition-opacity group-hover:opacity-100">
                    Explore Series →
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Machines */}
      <section className="mx-auto max-w-7xl px-4 py-24 md:px-12">
        <div className="flex items-end justify-between">
          <div>
            <p className="label-caps text-blush">Premium Selection</p>
            <h2 className="display mt-2 text-4xl md:text-5xl">Featured Machines</h2>
          </div>
          <Link href="/shop" className="label-caps hidden text-ember hover:text-blush md:block">
            View All Inventory →
          </Link>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featured.slice(0, 4).map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
        <Link href="/shop" className="label-caps mt-8 block text-center text-ember md:hidden">
          View All Inventory →
        </Link>
      </section>

      {/* Value props */}
      <section className="border-y border-steel bg-coal">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 md:grid-cols-2 md:px-12">
          <div>
            <p className="label-caps text-blush">Engineered Trust</p>
            <h2 className="display mt-2 text-4xl md:text-5xl">
              The Joy of Shopping <span className="text-ember">at its Best</span>
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              {VALUE_PROPS.map((prop) => (
                <div key={prop.title}>
                  <p className="display text-lg text-blush">{prop.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-silver">{prop.text}</p>
                </div>
              ))}
            </div>
          </div>
          <Image
            src="/images/product-venom.svg"
            alt="Venom V3 Trike detail"
            width={800}
            height={450}
            className="border border-steel"
          />
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-7xl px-4 py-24 md:px-12">
        <p className="label-caps text-center text-blush">What Our Clients Say</p>
        <h2 className="display mt-2 text-center text-4xl md:text-5xl">Customer Testimonials</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {testimonials.slice(0, 2).map((t) => (
            <figure key={t.name} className="border border-steel bg-carbon p-8">
              <Stars rating={t.rating} />
              <blockquote className="mt-5 italic leading-relaxed text-chrome">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span className="display flex h-10 w-10 items-center justify-center bg-crimson text-offwhite">
                  {t.initials[0]}
                </span>
                <span>
                  <span className="label-caps block text-offwhite">{t.name}</span>
                  <span className="font-mono text-xs text-silver">{t.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Newsletter */}
      <section className="border-t border-steel bg-coal">
        <div className="mx-auto max-w-7xl px-4 py-24 text-center md:px-12">
          <h2 className="display text-4xl md:text-5xl">Join the Nation</h2>
          <p className="mx-auto mt-4 max-w-xl text-silver">
            Get exclusive access to pre-orders, custom build drops, and technical maintenance
            guides directly to your inbox.
          </p>
          <div className="mt-8">
            <NewsletterForm />
          </div>
        </div>
      </section>
    </div>
  );
}
