import type { Metadata } from "next";
import PageShell, { Section } from "@/components/PageShell";
import ContactForm from "@/components/ContactForm";
import { fetchSettings } from "@/lib/api";
import { BRAND, EMAILS } from "@/lib/brand";

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
      <Section title="Department Inboxes">
        <p>
          Every address below is on <strong>{BRAND.domain}</strong> and monitored during garage
          hours.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { label: "Orders & Payments", email: EMAILS.orders, note: "Order status, invoices, refunds" },
            { label: "Support", email: EMAILS.support, note: "Assembly, tuning, spare parts" },
            { label: "Warranty Claims", email: EMAILS.warranty, note: "Photos + order number, please" },
            { label: "Sales & Custom Builds", email: EMAILS.sales, note: "Bulk, dealer, and one-off builds" },
            { label: "Privacy Requests", email: EMAILS.privacy, note: "Data export or deletion" },
            { label: "Everything Else", email: EMAILS.admin, note: "Press, partnerships, anything odd" },
          ].map((inbox) => (
            <div key={inbox.email} className="border border-steel-light p-5">
              <p className="label-caps text-blush">{inbox.label}</p>
              <a
                href={`mailto:${inbox.email}`}
                className="mt-2 block break-all font-mono text-sm font-bold text-offwhite hover:text-ember"
              >
                {inbox.email}
              </a>
              <p className="mt-1 font-mono text-xs text-silver">{inbox.note}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Visit the Facility">
        <p>
          <strong>Go Cart Grip HQ</strong>
          <br />
          {contact.address}
          <br />
          Facility tours by appointment only — call ahead and we&apos;ll fire up the demo track.
        </p>
      </Section>
    </PageShell>
  );
}
