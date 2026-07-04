import type { Metadata } from "next";
import PageShell, { Section } from "@/components/PageShell";
import { CONTACT } from "@/lib/catalog";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <PageShell kicker="Talk to the Garage" title="Contact Us">
      <Section title="Reach the Crew">
        <p>
          Questions about a build, a custom order, or an order in flight? The garage answers within
          one business day.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border border-steel-light p-5">
            <p className="label-caps text-blush">Phone</p>
            <p className="mt-2 font-mono text-lg font-bold text-offwhite">{CONTACT.phone}</p>
            <p className="mt-1 font-mono text-xs text-silver">Mon–Fri, 8am–5pm PT</p>
          </div>
          <div className="border border-steel-light p-5">
            <p className="label-caps text-blush">Email</p>
            <p className="mt-2 break-all font-mono text-lg font-bold text-offwhite">{CONTACT.email}</p>
            <p className="mt-1 font-mono text-xs text-silver">Replies within 24 hours</p>
          </div>
        </div>
      </Section>
      <Section title="Custom Builds">
        <p>
          Want a one-off colorway, a staged engine, or a full custom frame? Tell us what you&apos;re
          dreaming about — engine size, terrain, and budget — and our fabrication team will quote a
          build within 72 hours. Every custom build includes the same 12-month frame warranty as our
          production fleet.
        </p>
      </Section>
      <Section title="Visit the Facility">
        <p>
          <strong>Trike Nation HQ</strong>
          <br />
          4821 Throttle Way, Sacramento, CA 95814
          <br />
          Facility tours by appointment only — call ahead and we&apos;ll fire up the demo track.
        </p>
      </Section>
    </PageShell>
  );
}
