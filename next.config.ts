import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Prove dall'iPhone sulla stessa rete Wi-Fi (npm run dev:lan)
  // Indicatore di sviluppo in alto, per non coprire la barra di navigazione
  devIndicators: { position: "top-right" },
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  partialPrefetching: true,
  poweredByHeader: false,
  // Link d'invito corti: /i/CODICE → registrazione con il codice già scritto
  async redirects() {
    return [{ source: "/i/:code([A-Za-z0-9]{8,32})", destination: "/accedi?invito=:code", permanent: false }];
  },
  // Intestazioni di sicurezza su tutte le pagine. Niente CSP sugli script: quelli inline di Next e del tema
  // richiederebbero un nonce, cioè pagine generate a ogni richiesta. HSTS lo aggiunge già Vercel.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // L'app non può essere mostrata dentro pagine di altri siti
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // La fotocamera resta libera: le foto arrivano dal selettore di file del sistema
          { key: "Permissions-Policy", value: "microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
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
