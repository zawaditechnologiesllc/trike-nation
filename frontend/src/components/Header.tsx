"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/shop?category=drift-karts", label: "Drift Karts" },
  { href: "/shop?category=mini-bikes", label: "Mini Bikes" },
  { href: "/shop?category=mini-trikes", label: "Trikes" },
  { href: "/shop?category=quad-bikes", label: "Quads" },
  { href: "/shop", label: "Shop All" },
];

export default function Header() {
  const { count } = useCart();
  const { user, enabled } = useAuth();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-steel bg-night/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-12">
        <Link href="/" className="display text-2xl leading-none text-crimson hover:text-ember">
          Trike Nation
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="label-caps text-chrome transition-colors hover:text-ember"
            >
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
            className="text-chrome hover:text-ember md:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-steel bg-coal md:hidden" onClick={() => setOpen(false)}>
          {[...NAV, { href: user ? "/account" : "/login", label: user ? "Account" : "Sign In" }].map((item) => (
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

      {pathname === "/" && (
        <div className="overflow-hidden border-t border-crimson/40 bg-coal py-2">
          <div className="animate-marquee flex w-max whitespace-nowrap">
            {[0, 1].map((n) => (
              <span key={n} className="label-caps flex gap-8 pr-8 text-silver">
                <span>
                  Use the coupon <span className="text-ember">BIKEMIKE26</span> for 10% discount
                </span>
                <span className="text-crimson">•</span>
                <span>Black Friday Madness — up to 20% off</span>
                <span className="text-crimson">•</span>
                <span>Now shipping worldwide</span>
                <span className="text-crimson">•</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
