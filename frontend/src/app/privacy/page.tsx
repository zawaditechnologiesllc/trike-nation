import type { Metadata } from "next";
import PageShell, { Section } from "@/components/PageShell";
import { fetchSettings } from "@/lib/api";
import { EMAILS } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy Policy" };

export default async function PrivacyPage() {
  const { contact } = await fetchSettings();
  return (
    <PageShell kicker="Legal" title="Privacy Policy">
      <p className="font-mono text-xs text-silver">Last updated: November 2024</p>
      <Section title="What We Collect">
        <p>
          We collect what we need to build and ship your machine: your name, shipping address,
          email, phone number, and order history. If you create an account, your email and a
          securely hashed password are stored with our authentication provider (Supabase). We never
          see or store your card number — payments are processed by Stripe on their own hosted
          checkout.
        </p>
      </Section>
      <Section title="How We Use It">
        <p>
          Order fulfillment, shipping notifications, warranty service, and — only if you opt in —
          the Join the Crew newsletter. We do not sell or rent your personal information to
          anyone, ever.
        </p>
      </Section>
      <Section title="Cookies & Storage">
        <p>
          We use browser storage to keep your cart between visits and a session cookie to keep you
          signed in. No third-party advertising trackers run on this site.
        </p>
      </Section>
      <Section title="Your Rights">
        <p>
          You can request a copy of your data, correct it, or ask us to delete your account and
          order history at any time by emailing <strong>{EMAILS.privacy}</strong> (or{" "}
          <strong>{contact.email}</strong>). We respond to all requests within 30 days.
        </p>
      </Section>
    </PageShell>
  );
}
