import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "motionblur-studio";

const nextConfig: NextConfig = {
  // GitHub Pages için static export
  output: isGithubPages ? "export" : "standalone",
  // GitHub Pages alt yol (örn. /repo-name/) desteği
  basePath: isGithubPages ? `/${repoName}` : "",
  assetPrefix: isGithubPages ? `/${repoName}/` : undefined,
  // Statik export için gerekli
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai"],
};

export default nextConfig;
