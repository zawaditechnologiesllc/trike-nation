import type { Metadata } from "next";
import PageShell from "@/components/PageShell";

export const metadata: Metadata = { title: "FAQ" };

const FAQS = [
  {
    q: "Do your machines arrive assembled?",
    a: "Trikes and karts ship fully assembled and stress-tested. Minibikes arrive 90% assembled — handlebars and front wheel install in about 20 minutes with the included tool kit.",
  },
  {
    q: "Are these street legal?",
    a: "No. Trike Nation machines are built for private property, closed courses, and off-road use. Always check local regulations and wear a DOT-approved helmet.",
  },
  {
    q: "What engine do you use?",
    a: "Our core fleet runs 200cc and 212cc 4-stroke engines with heavy-duty centrifugal clutches. The Nighthawk 500 runs a 400cc big bore, and the Thunder Slide is fully electric (3kW hub motor).",
  },
  {
    q: "How fast do they go?",
    a: "Between 35 and 60 MPH depending on the model. The Viper ships restricted to 45 MPH; the restrictor can be removed for closed-course use.",
  },
  {
    q: "Do you ship internationally?",
    a: "Yes — we ship worldwide, free of charge. Freight machines (quads, buggies) ship palletized with liftgate delivery. Taxes and duties are calculated at checkout.",
  },
  {
    q: "How do drift sleeves work?",
    a: "Our proprietary PVC sleeves slide over the rear wheels to reduce traction for controlled drifting. Every Viper includes two replacement sleeves; the Drift Sleeve Master Kit fits all Trike Nation drift models.",
  },
  {
    q: "What discount codes are active?",
    a: "BIKEMIKE26 gives 10% off your entire order, stackable with Black Friday pricing already shown on the site.",
  },
  {
    q: "What if something breaks?",
    a: "Every machine carries a 12-month frame warranty and 6-month engine warranty. See the Warranty page for details — most claims are resolved with free parts shipped within 48 hours.",
  },
];

export default function FaqPage() {
  return (
    <PageShell kicker="Straight Answers" title="Frequently Asked Questions">
      <div className="space-y-4">
        {FAQS.map((faq) => (
          <details key={faq.q} className="group border border-steel bg-carbon">
            <summary className="display cursor-pointer list-none px-6 py-5 text-lg text-offwhite transition-colors hover:text-blush group-open:border-b group-open:border-steel group-open:text-ember">
              {faq.q}
            </summary>
            <p className="px-6 py-5 text-sm leading-relaxed text-silver">{faq.a}</p>
          </details>
        ))}
      </div>
    </PageShell>
  );
}
