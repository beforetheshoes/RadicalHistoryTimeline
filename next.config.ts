import type { NextConfig } from "next";

// Set GITHUB_PAGES=true in the CI workflow when building for Pages.
// Locally `npm run dev` and `npm run build` run without the basePath.
const isPages = process.env.GITHUB_PAGES === "true";
const repo = "RadicalHistoryTimeline";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isPages ? `/${repo}` : "",
  assetPrefix: isPages ? `/${repo}/` : "",
  // Expose the basePath to client code (used to fetch /data/derived/* at the right URL).
  env: {
    NEXT_PUBLIC_BASE_PATH: isPages ? `/${repo}` : "",
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
