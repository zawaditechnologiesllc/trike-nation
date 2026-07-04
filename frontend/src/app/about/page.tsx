import type { Metadata } from "next";
import Image from "next/image";
import PageShell, { Section } from "@/components/PageShell";
import SpecList from "@/components/SpecList";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <PageShell kicker="Engineered for Adrenaline" title={<>About Trike Nation</>}>
      <Section title="Our Story">
        <p>
          Trike Nation started in a two-car garage in Sacramento, California, with one welded frame,
          one 200cc engine, and a simple belief: small machines can deliver huge adrenaline. Today
          every trike, kart, minibike, and quad we ship is still individually assembled and
          stress-tested in our California facility.
        </p>
        <p>
          We build for enthusiasts who value both performance and status — machines that are
          over-engineered in the best sense: stable, high-quality, and ready for any terrain.
        </p>
      </Section>
      <Section title="How We Build">
        <p>
          Every machine that leaves Trike Nation is over-engineered for durability. We combine
          high-output 4-stroke engines with precision-welded frames for the ultimate ride.
        </p>
        <SpecList
          specs={[
            { label: "Frame Grade", value: "Chromoly Steel" },
            { label: "Max Torque", value: "13.5 Nm @ 2500RPM" },
            { label: "Drive System", value: "Centrifugal Clutch" },
            { label: "Assembly", value: "Hand-Built in California" },
          ]}
        />
      </Section>
      <Section title="The Nation">
        <p>
          More than a store, Trike Nation is a community of riders, builders, and drifters. Join the
          newsletter for exclusive drops, racing events, and technical builds delivered to your
          garage.
        </p>
      </Section>
      <Image
        src="/images/hero-garage.svg"
        alt="The Trike Nation garage"
        width={1600}
        height={900}
        className="border border-steel"
      />
    </PageShell>
  );
}
