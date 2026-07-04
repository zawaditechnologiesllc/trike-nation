import type { Metadata } from "next";
import PageShell, { Section } from "@/components/PageShell";
import SpecList from "@/components/SpecList";
import { fetchSettings } from "@/lib/api";

export const metadata: Metadata = { title: "Warranty" };

export default async function WarrantyPage() {
  const { contact } = await fetchSettings();
  return (
    <PageShell kicker="Over-Engineered, Backed Up" title="Warranty">
      <Section title="Coverage">
        <SpecList
          specs={[
            { label: "Frame & Welds", value: "12 Months" },
            { label: "Engine & Drivetrain", value: "6 Months" },
            { label: "Brakes & Controls", value: "6 Months" },
            { label: "Electrical (Thunder Slide)", value: "12 Months / Battery 6" },
            { label: "Wear Items (Sleeves, Tires, Pads)", value: "Not Covered" },
          ]}
        />
      </Section>
      <Section title="What's Covered">
        <p>
          Defects in materials and workmanship under normal recreational use: cracked welds, engine
          failures not caused by neglect, brake hydraulic failures, and manufacturer electrical
          faults. Most claims are resolved with free replacement parts shipped within 48 hours;
          machines with structural failures are repaired or replaced at our cost.
        </p>
      </Section>
      <Section title="What Voids It">
        <p>
          Racing damage, removal of the speed restrictor outside closed-course use, engine swaps or
          non-TN performance parts, running without oil, and commercial rental use. Normal drift
          sleeve wear is by design — that&apos;s the point.
        </p>
      </Section>
      <Section title="Making a Claim">
        <p>
          Email <strong>{contact.email}</strong> with your order number, photos or video of the
          issue, and a short description. Claims are acknowledged within one business day and
          approved claims ship parts within 48 hours.
        </p>
      </Section>
    </PageShell>
  );
}
