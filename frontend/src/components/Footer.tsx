import Link from "next/link";
import NewsletterForm from "./NewsletterForm";
import type { SiteSettings } from "@/lib/types";

interface NavCategory {
  slug: string;
  name: string;
}

const DEFAULT_CATEGORIES: NavCategory[] = [
  { slug: "drift-karts", name: "Drift Go-Karts" },
  { slug: "mini-trikes", name: "Mini Trikes" },
  { slug: "mini-bikes", name: "Mini Bikes" },
  { slug: "quad-bikes", name: "Quad Bikes" },
  { slug: "spare-parts", name: "Spare Parts" },
];

const QUICK_LINKS = [
  { label: "Support", href: "/support" },
  { label: "Shipping Info", href: "/shipping" },
  { label: "Warranty", href: "/warranty" },
  { label: "FAQ", href: "/faq" },
  { label: "My Account", href: "/account" },
  { label: "Cart", href: "/cart" },
];

const COMPANY_LEGAL = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Cookie Policy", href: "/cookies" },
];

export default function Footer({
  contact,
  social,
  categories,
}: {
  contact: SiteSettings["contact"];
  social: SiteSettings["social"];
  categories?: NavCategory[];
}) {
  const cats = categories?.length ? categories : DEFAULT_CATEGORIES;

  return (
    <footer className="border-t-2 border-crimson bg-coal">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 md:grid-cols-2 md:px-12 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr]">
        <div>
          <p className="display text-3xl text-crimson">Trike Nation</p>
          <p className="mt-4 text-sm leading-relaxed text-silver">
            Engineered for adrenaline. Handcrafted mini trikes and quads built for those who never
            stop exploring.
          </p>
          <address className="mt-6 font-mono text-xs not-italic leading-relaxed text-silver">
            {contact.address}
            <br />
            {contact.hours}
            <br />
            <a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`} className="hover:text-ember">
              {contact.phone}
            </a>
            <br />
            <a href={`mailto:${contact.email}`} className="hover:text-ember">
              {contact.email}
            </a>
          </address>
        </div>

        <div>
          <p className="label-caps text-blush">Products</p>
          <ul className="mt-4 space-y-3">
            {cats.map((cat) => (
              <li key={cat.slug}>
                <Link href={`/shop?category=${cat.slug}`} className="font-mono text-sm text-chrome hover:text-ember">
                  {cat.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/shop" className="font-mono text-sm text-ember hover:text-blush">
                Shop All →
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="label-caps text-blush">Quick Links</p>
          <ul className="mt-4 space-y-3">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="font-mono text-sm text-chrome hover:text-ember">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="label-caps text-blush">Company & Legal</p>
          <ul className="mt-4 space-y-3">
            {COMPANY_LEGAL.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="font-mono text-sm text-chrome hover:text-ember">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="label-caps text-blush">Join the Nation</p>
          <p className="mt-4 text-sm text-silver">
            Get adrenaline-fueled updates and exclusive early access.
          </p>
          <div className="mt-4">
            <NewsletterForm compact />
          </div>
          <div className="mt-6 flex gap-5">
            {social.facebook && (
              <a href={social.facebook} className="font-mono text-xs text-silver hover:text-ember" target="_blank" rel="noreferrer">
                Facebook
              </a>
            )}
            {social.instagram && (
              <a href={social.instagram} className="font-mono text-xs text-silver hover:text-ember" target="_blank" rel="noreferrer">
                Instagram
              </a>
            )}
            {social.threads && (
              <a href={social.threads} className="font-mono text-xs text-silver hover:text-ember" target="_blank" rel="noreferrer">
                Threads
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-steel">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 font-mono text-xs text-silver md:flex-row md:px-12">
          <p>© 2024 TRIKE NATION. ENGINEERED FOR ADRENALINE.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-ember">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-ember">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
