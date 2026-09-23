import type { NextConfig } from "next";

/**
 * SYNFORMA_STATIC=1 builds a fully static export (no API routes) for static hosts such as
 * GitHub Pages; NEXT_PUBLIC_BASE_PATH mounts the app under a sub-path (e.g. "/synforma").
 * SYNFORMA_STANDALONE=1 builds the self-contained server the container image runs
 * (.next/standalone/server.js); the Dockerfile sets it. The default build is the ordinary
 * Node build with the API routes, which `next start` and the Netlify runtime serve.
 */
const isStatic = process.env.SYNFORMA_STATIC === "1";
const isStandalone = !isStatic && process.env.SYNFORMA_STANDALONE === "1";
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Do not let `next dev` write AGENTS.md / CLAUDE.md into the project.
  agentRules: false,
  ...(isStatic ? { output: "export" as const, trailingSlash: true } : {}),
  ...(isStandalone ? { output: "standalone" as const } : {}),
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  // The sandbox application is embedded in a same-origin iframe by Mission Control and the Employee view.
  ...(isStatic
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/sandbox/:path*",
              headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
            },
          ];
        },
      }),
};

export default nextConfig;
