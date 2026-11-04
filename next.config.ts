import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No hardcoded region/credentials — all from env vars
  // Images from S3 require domain allow-listing; bucket name from env
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
    ],
  },
};

export default nextConfig;
