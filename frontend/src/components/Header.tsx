"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";

interface NavCategory {
  slug: string;
  name: string;
}

// Fallback if the categories API is briefly unreachable — mirrors the seed.
const DEFAULT_CATEGORIES: NavCategory[] = [
  { slug: "drift-karts", name: "Drift Go-Karts" },
  { slug: "mini-trikes", name: "Mini Trikes" },
  { slug: "mini-bikes", name: "Mini Bikes" },
  { slug: "quad-bikes", name: "Quad Bikes" },
  { slug: "spare-parts", name: "Spare Parts" },
];

const PAGE_LINKS = [
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Header({
  announcements = [],
  categories,
}: {
  announcements?: string[];
  categories?: NavCategory[];
}) {
  const { count } = useCart();
  const { user, enabled } = useAuth();
  const [open, setOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const pathname = usePathname();
  const cats = categories?.length ? categories : DEFAULT_CATEGORIES;
  const spareParts = cats.find((c) => c.slug === "spare-parts");

  return (
    <header className="sticky top-0 z-50 border-b border-steel bg-night/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-12">
        <Link href="/" className="display text-2xl leading-none text-crimson hover:text-ember">
          Trike Nation
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          <Link href="/" className="label-caps text-chrome transition-colors hover:text-ember">
            Home
          </Link>

          {/* Shop dropdown with the full fleet */}
          <div
            className="relative"
            onMouseEnter={() => setShopOpen(true)}
            onMouseLeave={() => setShopOpen(false)}
          >
            <button
              className={`label-caps flex items-center gap-1 transition-colors hover:text-ember ${
                shopOpen ? "text-ember" : "text-chrome"
              }`}
              aria-expanded={shopOpen}
              onClick={() => setShopOpen((v) => !v)}
            >
              Shop
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {shopOpen && (
              <div className="absolute left-1/2 top-full w-56 -translate-x-1/2 pt-3">
                <div className="border border-steel bg-coal shadow-2xl shadow-night" onClick={() => setShopOpen(false)}>
                  {cats.map((cat) => (
                    <Link
                      key={cat.slug}
                      href={`/shop?category=${cat.slug}`}
                      className="label-caps block border-b border-steel/50 px-5 py-3.5 text-chrome hover:bg-carbon hover:text-ember"
                    >
                      {cat.name}
                    </Link>
                  ))}
                  <Link
                    href="/shop"
                    className="label-caps block px-5 py-3.5 text-ember hover:bg-carbon hover:text-blush"
                  >
                    Shop All →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {spareParts && (
            <Link
              href={`/shop?category=${spareParts.slug}`}
              className="label-caps text-chrome transition-colors hover:text-ember"
            >
              Spare Parts
            </Link>
          )}

          {PAGE_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="label-caps text-chrome transition-colors hover:text-ember">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href={user ? "/account" : "/login"}
            className="label-caps hidden text-chrome transition-colors hover:text-ember sm:block"
          >
            {user ? "Account" : enabled ? "Sign In" : "Account"}
          </Link>
          <Link href="/cart" aria-label="Cart" className="relative text-chrome hover:text-ember">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1.5" />
              <circle cx="19" cy="21" r="1.5" />
              <path d="M2 3h3l2.6 12.5a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 8H6" />
            </svg>
            {count > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-sm bg-crimson px-0.5 font-mono text-[10px] font-bold text-offwhite">
                {count}
              </span>
            )}
          </Link>
          <button
            aria-label="Menu"
            className="text-chrome hover:text-ember lg:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-steel bg-coal lg:hidden" onClick={() => setOpen(false)}>
          <Link href="/" className="label-caps block border-b border-steel/50 px-4 py-4 text-chrome hover:bg-carbon hover:text-ember">
            Home
          </Link>
          <Link href="/shop" className="label-caps block border-b border-steel/50 px-4 py-4 text-ember hover:bg-carbon">
            Shop All
          </Link>
          {cats.map((cat) => (
            <Link
              key={cat.slug}
              href={`/shop?category=${cat.slug}`}
              className="label-caps block border-b border-steel/50 px-4 py-4 pl-8 text-chrome hover:bg-carbon hover:text-ember"
            >
              {cat.name}
            </Link>
          ))}
          {[...PAGE_LINKS, { href: user ? "/account" : "/login", label: user ? "Account" : "Sign In" }].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="label-caps block border-b border-steel/50 px-4 py-4 text-chrome hover:bg-carbon hover:text-ember"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      {pathname === "/" && announcements.length > 0 && (
        <div className="overflow-hidden border-t border-crimson/40 bg-coal py-2">
          <div className="animate-marquee flex w-max whitespace-nowrap">
            {[0, 1].map((n) => (
              <span key={n} className="label-caps flex gap-8 pr-8 text-silver">
                {announcements.map((text) => (
                  <span key={text} className="flex gap-8">
                    <span>{text}</span>
                    <span className="text-crimson">•</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
