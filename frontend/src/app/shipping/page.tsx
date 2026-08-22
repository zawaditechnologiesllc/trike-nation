import type { Metadata } from "next";
import PageShell, { Section } from "@/components/PageShell";
import SpecList from "@/components/SpecList";
import { DELIVERY_WINDOW } from "@/lib/brand";

export const metadata: Metadata = { title: "Shipping Info" };

export default function ShippingPage() {
  return (
    <PageShell kicker="Free · Worldwide" title="Shipping Info">
      <Section title="Free Worldwide Shipping">
        <p>
          Every order ships free, worldwide, no minimum. Machines are built to order, crated in our
          Sacramento facility, and fully insured in transit. Plan on{" "}
          <strong>
            {DELIVERY_WINDOW.minDays}–{DELIVERY_WINDOW.maxDays} days
          </strong>{" "}
          from the day your payment is confirmed to the day the crate lands.
        </p>
        <SpecList
          specs={[
            { label: "Build & Quality Check", value: "3–7 Days" },
            { label: "USA (Lower 48)", value: "12–18 Days Total" },
            { label: "Canada / Europe / UK", value: "15–25 Days Total" },
            { label: "Rest of World", value: "18–30 Days Total" },
          ]}
        />
      </Section>
      <Section title="Progress Updates">
        <p>
          You do not have to chase us. Once payment is confirmed we email you automatically on{" "}
          <strong>day 7</strong>, <strong>day 12</strong>, and <strong>day 20</strong> with where
          your machine is in the pipeline — plus an email the moment the order status changes at
          all. Signed-in customers can see the same timeline on their account page.
        </p>
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
          You&apos;ll get a tracking number by email the moment your crate leaves the dock, and
          signed-in customers can follow every order from their account page. Ordered as a guest?
          The confirmation email includes a one-click link to create an account with the same email
          address — your order attaches to it automatically.
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
