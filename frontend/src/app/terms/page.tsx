import type { Metadata } from "next";
import PageShell, { Section } from "@/components/PageShell";
import { fetchSettings } from "@/lib/api";
import { EMAILS } from "@/lib/brand";

export const metadata: Metadata = { title: "Terms of Service" };

export default async function TermsPage() {
  const { contact } = await fetchSettings();
  return (
    <PageShell kicker="Legal" title="Terms of Service">
      <p className="font-mono text-xs text-silver">Last updated: November 2024</p>
      <Section title="The Deal">
        <p>
          By purchasing from Go Cart Grip you agree to these terms. Our machines are high-performance
          recreational vehicles intended for off-road and closed-course use by riders who accept the
          inherent risks of motorsport.
        </p>
      </Section>
      <Section title="Rider Responsibility">
        <p>
          You are responsible for operating your machine safely: wear a DOT-approved helmet and
          protective gear, follow local laws, supervise riders under 16, and complete the break-in
          procedure before hard riding. Go Cart Grip machines are not street legal and are sold for
          private property and closed-course use only.
        </p>
      </Section>
      <Section title="Orders & Pricing">
        <p>
          Prices are in USD. Promotional pricing and discount codes (including BIKEMIKE26) can be
          modified or withdrawn at any time. We reserve the right to cancel and refund any order we
          cannot fulfill. Orders cancelled before crating are refunded in full; returns of unused
          machines are accepted within 30 days, with return freight deducted.
        </p>
      </Section>
      <Section title="Limitation of Liability">
        <p>
          To the maximum extent permitted by law, Go Cart Grip&apos;s liability is limited to the
          purchase price of your machine. Motorsport is dangerous — ride within your limits.
        </p>
      </Section>
      <Section title="Questions">
        <p>
          These terms are governed by the laws of the State of California. Questions? Email{" "}
          <strong>{contact.email}</strong> — order and payment questions go to{" "}
          <strong>{EMAILS.orders}</strong>.
        </p>
      </Section>
    </PageShell>
  );
}
