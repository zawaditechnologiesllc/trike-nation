export default function SpecList({ specs }: { specs: { label: string; value: string }[] }) {
  return (
    <dl className="space-y-4">
      {specs.map((spec) => (
        <div key={spec.label} className="spec-row">
          <dt className="label-caps text-silver">{spec.label}</dt>
          <span className="spec-leader" aria-hidden />
          <dd className="font-mono text-sm font-bold text-offwhite">{spec.value}</dd>
        </div>
      ))}
    </dl>
  );
}
