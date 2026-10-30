import type { NextConfig } from "next";

// US-029: cabeceras de seguridad en todas las respuestas.
// HTTPS (Strict-Transport-Security) ya lo agrega Vercel.
const cabecerasSeguridad = [
  { key: "X-Frame-Options", value: "DENY" }, // nadie puede meter la app en un iframe
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, // el token del QR no viaja a otros sitios
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [{ source: "/:path*", headers: cabecerasSeguridad }];
  },
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
