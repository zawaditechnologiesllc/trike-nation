import type { Metadata } from "next";
import PageShell, { Section } from "@/components/PageShell";
import SpecList from "@/components/SpecList";

export const metadata: Metadata = { title: "Shipping Info" };

export default function ShippingPage() {
  return (
    <PageShell kicker="Free · Worldwide" title="Shipping Info">
      <Section title="Free Worldwide Shipping">
        <p>
          Every order ships free, worldwide, no minimum. Machines are crated in our Sacramento
          facility and fully insured in transit.
        </p>
        <SpecList
          specs={[
            { label: "USA (Lower 48)", value: "3–7 Business Days" },
            { label: "Canada", value: "5–10 Business Days" },
            { label: "Europe / UK", value: "10–15 Business Days" },
            { label: "Rest of World", value: "12–21 Business Days" },
          ]}
        />
      </Section>
      <Section title="Freight Delivery">
        <p>
          Quads, buggies, and fully assembled trikes ship palletized freight with liftgate service.
          The carrier calls to schedule a delivery window — someone 18+ must be present to sign.
          Inspect the crate before signing and note any damage on the delivery receipt.
        </p>
      </Section>
      <Section title="Tracking">
        <p>
          Track your order effortlessly with our streamlined system. You&apos;ll get a tracking
          number by email the moment your crate leaves the dock, and signed-in customers can follow
          every order from their account page.
        </p>
      </Section>
      <Section title="Taxes & Duties">
        <p>
          US sales tax is calculated at checkout. International orders may be subject to local
          import duties collected by the carrier — these vary by country and are not included in
          the checkout total.
        </p>
      </Section>
    </PageShell>
  );
}
