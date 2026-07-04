import Link from "next/link";
import NewsletterForm from "./NewsletterForm";
import { CONTACT } from "@/lib/catalog";

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Quick Links",
    links: [
      { label: "Support", href: "/support" },
      { label: "Shipping Info", href: "/shipping" },
      { label: "Warranty", href: "/warranty" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t-2 border-crimson bg-coal">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 md:grid-cols-4 md:px-12">
        <div>
          <p className="display text-3xl text-crimson">Trike Nation</p>
          <p className="mt-4 text-sm leading-relaxed text-silver">
            Engineered for adrenaline. Handcrafted mini trikes and quads built for those who never
            stop exploring.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.heading}>
            <p className="label-caps text-blush">{col.heading}</p>
            <ul className="mt-4 space-y-3">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="font-mono text-sm text-chrome hover:text-ember">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="label-caps text-blush">Join the Nation</p>
          <p className="mt-4 text-sm text-silver">
            Get adrenaline-fueled updates and exclusive early access.
          </p>
          <div className="mt-4">
            <NewsletterForm compact />
          </div>
          <p className="mt-6 font-mono text-xs text-silver">
            {CONTACT.phone}
            <br />
            {CONTACT.email}
          </p>
        </div>
      </div>

      <div className="border-t border-steel">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 font-mono text-xs text-silver md:flex-row md:px-12">
          <p>© 2024 TRIKE NATION. ENGINEERED FOR ADRENALINE.</p>
          <div className="flex gap-6">
            <span className="hover:text-ember">Facebook</span>
            <span className="hover:text-ember">Instagram</span>
            <span className="hover:text-ember">Threads</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
