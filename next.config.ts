import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The bottom-left "N Issue(s)" badge is Next's DEV-ONLY on-screen indicator — by definition it
  // is never part of a `next build` production bundle (it just reports dev build/lint state). We
  // turn it off so it doesn't read as a shipped error; real build/runtime errors still surface
  // (Next docs: config/next-config-js/devIndicators). (#29)
  devIndicators: false,
};

export default nextConfig;
