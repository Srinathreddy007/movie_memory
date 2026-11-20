import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Google profile photos. next/image only loads from allow-listed hosts.
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
};

export default nextConfig;
