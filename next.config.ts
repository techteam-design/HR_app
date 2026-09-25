import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js leaves @aws-sdk/client-s3 unbundled by default. OpenNext then
  // needs a real symlink to copy it, which Windows refuses without Developer
  // Mode (EPERM). Bundling it avoids that; the Worker is fully bundled anyway.
  transpilePackages: ["@aws-sdk/client-s3"],
  images: {
    // On Cloudflare Workers, image optimisation needs the Cloudflare Images
    // binding (a separately billed product). The only next/image use is the
    // logo (public/brand), which is
    // served as-is from static assets. Employee photos are plain <img> tags
    // with presigned R2 URLs and never go through /_next/image.
    unoptimized: true,
  },
};

export default nextConfig;
