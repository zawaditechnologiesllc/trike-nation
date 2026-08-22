import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { Section } from "@/components/PageShell";
import { fetchSettings } from "@/lib/api";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const { contact } = await fetchSettings();
  return (
    <PageShell kicker="We've Got Your Back" title="Support">
      <Section title="Getting Help">
        <p>
          Every Go Cart Grip machine ships with a printed manual and a maintenance tool kit. For
          anything the manual doesn&apos;t cover, reach us at <strong>{contact.email}</strong> or{" "}
          <strong>{contact.phone}</strong> — most technical questions are answered same-day.
        </p>
      </Section>
      <Section title="Assembly & First Ride">
        <p>
          Before your first ride: check tire pressure (12–15 PSI), torque the axle nuts, add SAE
          10W-30 oil (engines ship dry), and run the engine at half throttle for the first tank as
          break-in. Full torque specs are in your model&apos;s manual.
        </p>
      </Section>
      <Section title="Maintenance Schedule">
        <p>
          <strong>Every ride:</strong> tire pressure, chain tension, brake feel.
          <br />
          <strong>Every 10 hours:</strong> oil change, air filter check, bolt torque pass.
          <br />
          <strong>Every 50 hours:</strong> clutch inspection, brake pad measurement, sleeve wear
          check on drift models.
        </p>
      </Section>
      <Section title="Spare Parts">
        <p>
          Sleeves, clutches, brake pads, and full engines are stocked in Sacramento and ship within
          48 hours. Start with the{" "}
          <Link href="/products/drift-sleeve-master-kit" className="text-ember hover:text-blush">
            Drift Sleeve Master Kit
          </Link>{" "}
          — it fits every drift model we make.
        </p>
      </Section>
    </PageShell>
  );
}
