import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-32 text-center">
      <p className="label-caps text-ember">Error 404</p>
      <h1 className="display mt-4 text-6xl md:text-8xl">
        Lost <span className="text-ember">Traction</span>
      </h1>
      <p className="mt-6 text-silver">This page spun out. Let&apos;s get you back on the track.</p>
      <Link
        href="/"
        className="display glow-red mt-10 inline-block bg-crimson px-8 py-4 text-lg text-offwhite hover:bg-ember"
      >
        Back to the Garage
      </Link>
    </div>
  );
}
