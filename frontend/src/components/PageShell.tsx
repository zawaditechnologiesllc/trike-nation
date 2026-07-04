export default function PageShell({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 md:px-12">
      <p className="label-caps text-blush">{kicker}</p>
      <h1 className="display mt-2 text-4xl md:text-6xl">{title}</h1>
      <div className="mt-10 space-y-8">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-steel bg-carbon p-6 md:p-8">
      <h2 className="display border-l-4 border-crimson pl-4 text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-silver [&_strong]:text-chrome">{children}</div>
    </section>
  );
}
