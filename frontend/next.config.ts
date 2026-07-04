import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Product imagery is admin-managed: uploads land in Supabase Storage and
    // admins may also paste external URLs, so any https host is allowed.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
