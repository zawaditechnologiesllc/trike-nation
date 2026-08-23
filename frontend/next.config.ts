import type { NextConfig } from "next";

/** One year — product images are immutable (each upload gets a new URL). */
const IMAGE_CACHE_SECONDS = 31_536_000;

const nextConfig: NextConfig = {
  images: {
    // Product imagery is admin-managed: uploads land in Supabase Storage and
    // admins may also paste external URLs, so any https host is allowed.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    // Cloudflare Workers has no sharp binary, so images are served as
    // uploaded. Supabase Storage already returns them with a one-year
    // cache-control, and Cloudflare caches them at the edge.
    unoptimized: true,
    minimumCacheTTL: IMAGE_CACHE_SECONDS,
  },
  async headers() {
    return [
      {
        // Bundled product/category artwork — content never changes under a
        // given filename, so cache it for a year.
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: `public, max-age=${IMAGE_CACHE_SECONDS}, immutable` },
        ],
      },
    ];
  },
};

export default nextConfig;
