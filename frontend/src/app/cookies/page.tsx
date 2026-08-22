import type { Metadata } from "next";
import PageShell, { Section } from "@/components/PageShell";
import SpecList from "@/components/SpecList";
import { fetchSettings } from "@/lib/api";

export const metadata: Metadata = { title: "Cookie Policy" };

export default async function CookiesPage() {
  const { contact } = await fetchSettings();
  return (
    <PageShell kicker="Legal" title="Cookie Policy">
      <p className="font-mono text-xs text-silver">Last updated: November 2024</p>
      <Section title="The Short Version">
        <p>
          Go Cart Grip uses only the storage a store needs to function. No advertising trackers,
          no third-party analytics pixels, no data brokers — your riding habits are your business.
        </p>
      </Section>
      <Section title="What We Store">
        <SpecList
          specs={[
            { label: "Cart Contents", value: "Browser Storage · Functional" },
            { label: "Sign-In Session", value: "Auth Token · Functional" },
            { label: "Payment Session", value: "Stripe · During Checkout" },
            { label: "Ad / Marketing Trackers", value: "None" },
          ]}
        />
        <p>
          <strong>Cart contents</strong> live in your browser&apos;s local storage so your build
          survives a page refresh. <strong>Sign-in sessions</strong> are stored by our
          authentication provider (Supabase) to keep you logged in. During checkout,
          <strong> Stripe or PayPal</strong> set their own cookies on their hosted payment pages,
          governed by their respective privacy policies.
        </p>
      </Section>
      <Section title="Managing Storage">
        <p>
          Everything we store is functional, so there is nothing to opt out of without breaking the
          cart or sign-in. You can clear it anytime through your browser&apos;s site-data settings —
          you&apos;ll simply be signed out and your cart emptied.
        </p>
      </Section>
      <Section title="Questions">
        <p>
          Email <strong>{contact.email}</strong> and we&apos;ll answer within one business day.
        </p>
      </Section>
    </PageShell>
  );
}
