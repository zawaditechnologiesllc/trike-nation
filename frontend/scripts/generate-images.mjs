/**
 * Generates the placeholder SVG imagery in public/images.
 * Run with: node scripts/generate-images.mjs
 * Swap these for real product photography when available.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "images");
mkdirSync(outDir, { recursive: true });

const NIGHT = "#0f0f0f";
const CARBON = "#1a1a1a";
const STEEL = "#333333";
const SILVER = "#8e8e93";
const OFFWHITE = "#f5f5f7";
const CRIMSON = "#b31d28";
const EMBER = "#ff3b45";

const wheel = (cx, cy, r, accent) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${NIGHT}" stroke="${STEEL}" stroke-width="${r * 0.28}"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.42}" fill="none" stroke="${accent}" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.1}" fill="${SILVER}"/>
  ${[0, 60, 120].map((a) => `<line x1="${cx}" y1="${cy}" x2="${cx + r * 0.4 * Math.cos((a * Math.PI) / 180)}" y2="${cy + r * 0.4 * Math.sin((a * Math.PI) / 180)}" stroke="${SILVER}" stroke-width="2"/>`).join("")}
`;

// Stylized side-view machine silhouettes built from primitives.
const silhouettes = {
  trike: (a) => `
    ${wheel(560, 300, 78, a)}
    ${wheel(220, 310, 54, a)}
    <path d="M220 310 L340 240 L470 240 L560 300" fill="none" stroke="${a}" stroke-width="10" stroke-linecap="round"/>
    <path d="M340 240 L300 150 M300 150 L260 140 M300 150 L340 140" fill="none" stroke="${SILVER}" stroke-width="8" stroke-linecap="round"/>
    <rect x="430" y="200" width="90" height="42" rx="6" fill="${CARBON}" stroke="${STEEL}" stroke-width="3"/>
  `,
  kart: (a) => `
    ${wheel(200, 320, 52, a)}
    ${wheel(590, 320, 62, a)}
    <path d="M200 320 L280 260 L500 260 L590 320" fill="none" stroke="${a}" stroke-width="10" stroke-linecap="round"/>
    <path d="M330 260 L330 190 L400 190" fill="none" stroke="${SILVER}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="405" cy="190" r="26" fill="none" stroke="${SILVER}" stroke-width="7"/>
    <rect x="430" y="215" width="100" height="46" rx="8" fill="${CARBON}" stroke="${STEEL}" stroke-width="3"/>
  `,
  minibike: (a) => `
    ${wheel(230, 315, 62, a)}
    ${wheel(570, 315, 62, a)}
    <path d="M230 315 L340 230 L470 230 L570 315" fill="none" stroke="${a}" stroke-width="10" stroke-linecap="round"/>
    <path d="M470 230 L520 160 M520 160 L480 150 M520 160 L555 150" fill="none" stroke="${SILVER}" stroke-width="8" stroke-linecap="round"/>
    <path d="M300 230 L360 180 L410 180" fill="none" stroke="${SILVER}" stroke-width="8" stroke-linecap="round"/>
    <rect x="360" y="205" width="80" height="40" rx="6" fill="${CARBON}" stroke="${STEEL}" stroke-width="3"/>
  `,
  buggy: (a) => `
    ${wheel(220, 320, 58, a)}
    ${wheel(575, 320, 58, a)}
    <path d="M220 320 L270 250 L520 250 L575 320" fill="none" stroke="${a}" stroke-width="10" stroke-linecap="round"/>
    <path d="M290 250 L330 150 L470 150 L510 250" fill="none" stroke="${SILVER}" stroke-width="8" stroke-linejoin="round"/>
    <line x1="330" y1="150" x2="310" y2="250" stroke="${SILVER}" stroke-width="6"/>
    <rect x="360" y="200" width="90" height="50" rx="8" fill="${CARBON}" stroke="${STEEL}" stroke-width="3"/>
  `,
  quad: (a) => `
    ${wheel(235, 320, 64, a)}
    ${wheel(560, 320, 64, a)}
    ${wheel(330, 330, 46, a)}
    <path d="M235 320 L320 245 L500 245 L560 320" fill="none" stroke="${a}" stroke-width="10" stroke-linecap="round"/>
    <path d="M380 245 L420 170 M420 170 L385 160 M420 170 L455 160" fill="none" stroke="${SILVER}" stroke-width="8" stroke-linecap="round"/>
    <rect x="300" y="215" width="70" height="30" rx="4" fill="${CARBON}" stroke="${STEEL}" stroke-width="3"/>
    <rect x="470" y="215" width="70" height="30" rx="4" fill="${CARBON}" stroke="${STEEL}" stroke-width="3"/>
  `,
  parts: (a) => `
    <circle cx="300" cy="270" r="85" fill="none" stroke="${a}" stroke-width="14"/>
    <circle cx="300" cy="270" r="48" fill="none" stroke="${SILVER}" stroke-width="8"/>
    <circle cx="490" cy="270" r="85" fill="none" stroke="${STEEL}" stroke-width="14"/>
    <circle cx="490" cy="270" r="48" fill="none" stroke="${SILVER}" stroke-width="8"/>
    <rect x="360" y="250" width="70" height="40" rx="6" fill="${CARBON}" stroke="${a}" stroke-width="4"/>
  `,
  engine: (a) => `
    <rect x="300" y="180" width="200" height="160" rx="12" fill="${CARBON}" stroke="${STEEL}" stroke-width="5"/>
    ${[320, 350, 380, 410, 440, 470].map((x) => `<line x1="${x}" y1="180" x2="${x}" y2="140" stroke="${SILVER}" stroke-width="7"/>`).join("")}
    <circle cx="400" cy="260" r="42" fill="none" stroke="${a}" stroke-width="8"/>
    <circle cx="400" cy="260" r="14" fill="${a}"/>
    <path d="M500 300 C 560 300 570 250 600 250" fill="none" stroke="${SILVER}" stroke-width="10" stroke-linecap="round"/>
    <rect x="250" y="280" width="50" height="60" rx="8" fill="${NIGHT}" stroke="${a}" stroke-width="4"/>
  `,
};

function svg({ title, sub, kind, accent = CRIMSON, w = 800, h = 450 }) {
  const art = silhouettes[kind] ? silhouettes[kind](accent) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c1b1b"/>
      <stop offset="1" stop-color="${NIGHT}"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0 H0 V40" fill="none" stroke="#242424" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="800" height="450" fill="url(#bg)"/>
  <rect width="800" height="450" fill="url(#grid)"/>
  <rect x="0" y="440" width="800" height="10" fill="${accent}" opacity="0.85"/>
  <line x1="120" y1="376" x2="680" y2="376" stroke="${STEEL}" stroke-width="3"/>
  ${art}
  <text x="400" y="70" text-anchor="middle" font-family="'Arial Black', Arial, sans-serif" font-weight="900" font-size="30" letter-spacing="4" fill="${OFFWHITE}">${title.toUpperCase()}</text>
  ${sub ? `<text x="400" y="100" text-anchor="middle" font-family="'Courier New', monospace" font-weight="700" font-size="15" letter-spacing="5" fill="${SILVER}">${sub.toUpperCase()}</text>` : ""}
  <text x="24" y="432" font-family="'Courier New', monospace" font-size="12" letter-spacing="3" fill="${SILVER}">GO CART GRIP // ENGINEERED FOR ADRENALINE</text>
</svg>`;
}

const images = [
  ["product-viper.svg", { title: "Viper TGV", sub: "Special Edition · 200cc", kind: "trike", accent: EMBER }],
  ["product-drift-kart.svg", { title: "Drift Trike Go-Kart", sub: "200cc · 4-Stroke", kind: "kart" }],
  ["product-minibike.svg", { title: "Monster Minibike", sub: "212cc · 60 MPH", kind: "minibike" }],
  ["product-dune-buggy.svg", { title: "Dune Buggy", sub: "200cc · Roll Cage", kind: "buggy" }],
  ["product-quad.svg", { title: "Quad · Black", sub: "200cc · All-Terrain", kind: "quad" }],
  ["product-sleeve-kit.svg", { title: "Sleeve Master Kit", sub: "Drift Consumables", kind: "parts" }],
  ["product-venom.svg", { title: "Venom V3", sub: "212cc Staged · 55 MPH", kind: "trike", accent: EMBER }],
  ["product-scorpion.svg", { title: "Scorpion Kart", sub: "145 lbs · Chain-Driven", kind: "kart" }],
  ["product-nighthawk.svg", { title: "Nighthawk 500", sub: "400cc · Big Bore", kind: "quad" }],
  ["product-thunder-slide.svg", { title: "Thunder Slide", sub: "Electric · 3kW", kind: "kart", accent: EMBER }],
  ["category-drift-karts.svg", { title: "Drift Go-Karts", sub: "Maximum Lateral G", kind: "kart" }],
  ["category-mini-trikes.svg", { title: "Mini Trikes", sub: "Bestseller", kind: "trike" }],
  ["category-mini-bikes.svg", { title: "Mini Bikes", sub: "Compact Power", kind: "minibike" }],
  ["category-quad-bikes.svg", { title: "Quad Bikes", sub: "All-Terrain", kind: "quad" }],
  ["category-spare-parts.svg", { title: "Spare Parts", sub: "Keep It Roaring", kind: "parts" }],
  ["hero-garage.svg", { title: "", sub: "", kind: "trike", accent: EMBER, w: 1600, h: 900 }],
  ["engine-detail.svg", { title: "", sub: "13.5 Nm @ 2500 RPM", kind: "engine", accent: EMBER }],
];

for (const [file, opts] of images) {
  writeFileSync(join(outDir, file), svg(opts));
}
console.log(`Wrote ${images.length} SVGs to ${outDir}`);
