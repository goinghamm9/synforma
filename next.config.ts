import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not let `next dev` write AGENTS.md / CLAUDE.md into the project.
  agentRules: false,
  // The sandbox application is embedded in a same-origin iframe by Mission Control and the Employee view.
  async headers() {
    return [
      {
        source: "/sandbox/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default nextConfig;
