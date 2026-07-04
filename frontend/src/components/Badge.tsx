export default function Badge({ children, tone = "red" }: { children: React.ReactNode; tone?: "red" | "steel" }) {
  return (
    <span
      className={`label-caps inline-block px-2 py-1 ${
        tone === "red" ? "bg-crimson text-offwhite" : "bg-carbon-high text-chrome"
      }`}
    >
      {children}
    </span>
  );
}
