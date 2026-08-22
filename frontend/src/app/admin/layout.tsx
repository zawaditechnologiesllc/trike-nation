"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { adminFetch } from "@/lib/admin";

const NAV: { href: string; label: string; exact?: boolean; except?: string[] }[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/orders/paid", label: "Paid Orders", exact: true },
  // Paid Orders lives under /admin/orders, so exclude it from the prefix match.
  { href: "/admin/orders", label: "All Orders", except: ["/admin/orders/paid"] },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/discounts", label: "Discounts" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/subscribers", label: "Subscribers" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/testimonials", label: "Testimonials" },
  { href: "/admin/settings", label: "Site Settings" },
  { href: "/admin/system", label: "System" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, enabled } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [access, setAccess] = useState<"checking" | "granted" | "denied">("checking");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!enabled || !user) {
      router.replace("/login");
      return;
    }
    adminFetch<{ isAdmin: boolean }>("/me")
      .then(() => setAccess("granted"))
      .catch(() => setAccess("denied"));
  }, [loading, enabled, user, router]);

  if (loading || access === "checking") {
    return (
      <div className="mx-auto max-w-md px-4 py-32 text-center">
        <p className="label-caps text-silver">Verifying admin credentials…</p>
      </div>
    );
  }

  if (access === "denied") {
    return (
      <div className="mx-auto max-w-md px-4 py-32 text-center">
        <h1 className="display text-4xl">
          Access <span className="text-ember">Denied</span>
        </h1>
        <p className="mt-6 font-mono text-sm text-silver">
          This account doesn&apos;t have admin access. An existing admin (or supabase/make-admin.sql)
          can grant it.
        </p>
        <Link href="/" className="display glow-red mt-10 inline-block bg-crimson px-8 py-3 text-offwhite hover:bg-ember">
          Back to Store
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-8 lg:flex-row">
      {/* Sidebar / top bar */}
      <aside className="lg:w-56 lg:shrink-0">
        <div className="flex items-center justify-between lg:block">
          <p className="display text-2xl text-blush">Admin</p>
          <button
            className="label-caps border border-steel px-3 py-2 text-chrome lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
        <nav className={`mt-4 flex-col gap-1 lg:flex ${menuOpen ? "flex" : "hidden"}`} onClick={() => setMenuOpen(false)}>
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href) && !item.except?.includes(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`label-caps border-l-2 px-4 py-3 transition-colors ${
                  active
                    ? "border-crimson bg-carbon text-offwhite"
                    : "border-transparent text-silver hover:border-steel hover:text-chrome"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
