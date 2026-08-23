import type { Metadata } from "next";
import { Anton, JetBrains_Mono, Manrope } from "next/font/google";
import { CartProvider } from "@/lib/cart";
import { AuthProvider } from "@/lib/auth";
import { fetchCategories, fetchSettings } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import PublicEnvScript from "@/components/PublicEnvScript";
import { organizationJsonLd, websiteJsonLd } from "@shared/core/trust";
import "./globals.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

const DESCRIPTION =
  "Engineered for the bold. High-performance mini trikes, drift karts, mini bikes, and quads built for ultimate durability and speed. Free worldwide shipping, delivered in 12–30 days.";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: {
    default: `${BRAND.name} | Handcrafted Adrenaline`,
    template: `%s | ${BRAND.name}`,
  },
  description: DESCRIPTION,
  applicationName: BRAND.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name} | Handcrafted Adrenaline`,
    description: DESCRIPTION,
    url: BRAND.url,
  },
  twitter: { card: "summary_large_image", title: BRAND.name, description: DESCRIPTION },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [settings, categories] = await Promise.all([fetchSettings(), fetchCategories()]);
  const navCategories = categories.map((c) => ({ slug: c.slug, name: c.name }));

  // One identity, read by the footer and by the markup below. A value still
  // holding a shipped default is omitted rather than published — see
  // shared/core/trust.ts.
  const identity = {
    name: BRAND.name,
    legalName: settings.legalName,
    url: BRAND.url,
    logoUrl: settings.logoUrl,
    description: DESCRIPTION,
    email: settings.contact.email,
    phone: settings.contact.phone,
    address: settings.contact.address,
    social: settings.social,
  };
  return (
    <html lang="en" className={`${anton.variable} ${manrope.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen antialiased">
        {/* Injected per request: NEXT_PUBLIC_* is inlined at BUILD time on
            Workers, so a runtime-only value would be an empty string. */}
        <PublicEnvScript />
        <JsonLd data={[organizationJsonLd(identity), websiteJsonLd(identity)]} />
        <AuthProvider>
          <CartProvider>
            <Header announcements={settings.announcements} categories={navCategories} />
            <main>{children}</main>
            <Footer contact={settings.contact} social={settings.social} categories={navCategories} />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
