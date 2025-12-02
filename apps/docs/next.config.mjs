import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  serverExternalPackages: ["typescript", "@vercel/og"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Stub out @vercel/og to prevent WASM bundling issues on Cloudflare
      config.resolve.alias = {
        ...config.resolve.alias,
        "@vercel/og": false,
        "next/og": false,
      };
    }
    return config;
  },
  async redirects() {
    return [
      {
        source: "/docs",
        destination: "/docs/ocx/introduction",
        permanent: false,
      },
      {
        source: "/docs/ocx",
        destination: "/docs/ocx/introduction",
        permanent: false,
      },
      {
        source: "/docs/registries",
        destination: "/docs/registries/introduction",
        permanent: false,
      },
    ];
  },
};

export default withMDX(config);

initOpenNextCloudflareForDev();
