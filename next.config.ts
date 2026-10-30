import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Prove dall'iPhone sulla stessa rete Wi-Fi (npm run dev:lan)
  // Indicatore di sviluppo in alto, per non coprire la barra di navigazione
  devIndicators: { position: "top-right" },
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
