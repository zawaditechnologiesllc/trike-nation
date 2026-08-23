/**
 * Structured data. Built from the same settings the footer renders, so the
 * name, address and phone can never disagree across the site — and every
 * value passes the placeholder guard before it is published.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output cannot contain a raw "</script>"; the escape
      // below covers the one sequence that could close this tag early.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
