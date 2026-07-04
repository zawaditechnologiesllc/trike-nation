import type { Metadata } from "next";
import PageShell, { Section } from "@/components/PageShell";
import ContactForm from "@/components/ContactForm";
import { fetchSettings } from "@/lib/api";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const { contact } = await fetchSettings();

  return (
    <PageShell kicker="Talk to the Garage" title="Contact Us">
      <Section title="Send a Message">
        <p>
          Questions about a build, a custom order, or an order in flight? Drop a message — the
          garage answers within one business day.
        </p>
        <ContactForm />
      </Section>
      <Section title="Reach the Crew Directly">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border border-steel-light p-5">
            <p className="label-caps text-blush">Phone</p>
            <p className="mt-2 font-mono text-lg font-bold text-offwhite">{contact.phone}</p>
            <p className="mt-1 font-mono text-xs text-silver">{contact.hours}</p>
          </div>
          <div className="border border-steel-light p-5">
            <p className="label-caps text-blush">Email</p>
            <p className="mt-2 break-all font-mono text-lg font-bold text-offwhite">{contact.email}</p>
            <p className="mt-1 font-mono text-xs text-silver">Replies within 24 hours</p>
          </div>
        </div>
      </Section>
      <Section title="Visit the Facility">
        <p>
          <strong>Trike Nation HQ</strong>
          <br />
          {contact.address}
          <br />
          Facility tours by appointment only — call ahead and we&apos;ll fire up the demo track.
        </p>
      </Section>
    </PageShell>
  );
}
