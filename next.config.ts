import type { NextConfig } from "next";

// A stable per-deploy identifier, computed once at build time. It is inlined into
// the client bundle as NEXT_PUBLIC_BUILD_ID (via `env`) so the PWA can register a
// version-stamped service worker (`/sw.js?v=<buildId>`): each deploy is then a new
// worker the browser installs + activates, which clears the old cache. Prefer a
// commit SHA from the host when available so every container in a deploy agrees on
// the same id; fall back to a build timestamp. See docs/FEATURES.md → F11.
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.SOURCE_COMMIT ||
  process.env.GIT_HASH ||
  (process.env.NODE_ENV === "production" ? `${Date.now()}` : "dev");

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  generateBuildId: async () => buildId,
  async headers() {
    return [
      {
        // The service worker must never be served stale, or clients keep the old
        // worker (and its old cache) for up to the browser's 24h check cap after a
        // deploy. no-cache forces a revalidation on every load.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
