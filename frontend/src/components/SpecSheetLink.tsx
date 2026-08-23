/**
 * Downloadable A4 spec sheet. A plain link, not a script-driven download:
 * the viewer's browser decides what to do with a PDF, and a JS-driven save
 * silently does nothing in some contexts.
 */
export default function SpecSheetLink({ slug }: { slug: string }) {
  return (
    <a
      href={`/api/products/${slug}/spec.pdf`}
      className="label-caps inline-flex items-center gap-2 text-secondary hover:text-on-secondary-fixed"
    >
      ↓ Download spec sheet (PDF)
    </a>
  );
}
